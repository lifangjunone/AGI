"""
Prepare training data from iPhone Live Link Face recordings.

Accepts two input styles for each take:
    A) A loose folder like "20260410_MySlate_14/" containing
         MySlate_14_iPhone.mov, MySlate_14_iPhone_raw.csv, ...
       (what the iPhone app writes when you AirDrop straight to disk)
    B) A zipped take "LiveLinkFace_20260409_MySlate_9_iPhone.zip" containing
       the same files, one folder deep inside the archive.

For every take we only care about two things for training:
    audio.wav   — mono 16kHz WAV extracted from the .mov via ffmpeg
    face.npy    — [N, 52] float32 ARKit blendshapes, no header/timecode

Everything else (.mov, _cal.csv, _neutral.csv, thumbnails, metadata) is
ignored. Prepared data lands at:
    <out-dir>/<take_name>/audio.wav
    <out-dir>/<take_name>/face.npy

Running this script is idempotent: takes that already have both files in
the output directory are skipped. Stats and manifest are always recomputed
across the full set of prepared takes.

Run:
    python prepare_data.py --data-dir F:/Lipsync_Training_Data
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from constants import AUDIO_SR, N_BLENDSHAPES


# =============================================================================
# Take discovery
# =============================================================================

_LOOSE_NAME_RE = re.compile(r"^\d{8}_MySlate_\d+$")
_ZIP_NAME_RE = re.compile(r"^LiveLinkFace_\d{8}_MySlate_\d+_iPhone\.zip$")


def normalize_take_name(raw: str) -> str:
    """Collapse a source filename/dirname to the canonical '<date>_MySlate_<N>' form."""
    # Loose folder name is already canonical: 20260410_MySlate_14
    if _LOOSE_NAME_RE.match(raw):
        return raw
    # Zip file: LiveLinkFace_20260409_MySlate_9_iPhone.zip -> 20260409_MySlate_9
    m = re.match(r"^LiveLinkFace_(\d{8}_MySlate_\d+)_iPhone(?:\.zip)?$", raw)
    if m:
        return m.group(1)
    return raw  # fall back to whatever was passed in


def migrate_legacy_prepared(out_dir: Path) -> int:
    """
    One-time cleanup of prepared/ folders from the older zip-based pipeline:
      LiveLinkFace_<date>_MySlate_<N>_iPhone/  ->  <date>_MySlate_<N>/
    and drops any leftover .mov / .csv / .jpg / .json inside those folders
    (we only need audio.wav + face.npy).
    """
    if not out_dir.exists():
        return 0
    migrated = 0
    for p in list(out_dir.iterdir()):
        if not p.is_dir():
            continue
        legacy = re.match(r"^LiveLinkFace_(\d{8}_MySlate_\d+)_iPhone$", p.name)
        if not legacy:
            continue
        canonical = legacy.group(1)
        new_path = out_dir / canonical
        if new_path.exists() and new_path != p:
            # Already migrated elsewhere; just drop the legacy folder
            shutil.rmtree(p)
            continue
        p.rename(new_path)
        # Remove leftover non-training files from the old extraction
        for f in list(new_path.iterdir()):
            if f.name in ("audio.wav", "face.npy"):
                continue
            try:
                if f.is_dir():
                    shutil.rmtree(f)
                else:
                    f.unlink()
            except OSError:
                pass
        print(f"  migrated legacy: {p.name} -> {canonical}")
        migrated += 1
    return migrated


def find_loose_take_dirs(root: Path, out_dir: Path) -> list[Path]:
    """Return subfolders of `root` that look like unpacked iPhone takes."""
    out = []
    for p in sorted(root.iterdir()):
        if not p.is_dir():
            continue
        # Don't descend into the prepared output dir
        try:
            if p.resolve() == out_dir.resolve():
                continue
        except OSError:
            pass
        if _LOOSE_NAME_RE.match(p.name):
            # Sanity check: must contain a _raw.csv and a .mov
            has_csv = any(f.name.endswith("_raw.csv") for f in p.iterdir())
            has_mov = any(f.suffix == ".mov" for f in p.iterdir())
            if has_csv and has_mov:
                out.append(p)
    return out


def find_take_zips(root: Path) -> list[Path]:
    return sorted(
        p for p in root.glob("LiveLinkFace_*.zip")
        if not p.name.startswith("._") and _ZIP_NAME_RE.match(p.name)
    )


# =============================================================================
# Per-take processing
# =============================================================================

def locate_loose_files(take_dir: Path) -> tuple[Path, Path]:
    """Return (mov_path, csv_path) inside an already-unpacked take folder."""
    mov = next((f for f in take_dir.iterdir() if f.suffix == ".mov"), None)
    csv = next((f for f in take_dir.iterdir() if f.name.endswith("_raw.csv")), None)
    if mov is None or csv is None:
        raise FileNotFoundError(f"missing .mov or _raw.csv in {take_dir}")
    return mov, csv


def unpack_zip_to_temp(zip_path: Path, temp_dir: Path) -> tuple[Path, Path]:
    """Extract just the .mov and _raw.csv from a zip. Returns (mov, csv) paths."""
    temp_dir.mkdir(parents=True, exist_ok=True)
    mov_out: Path | None = None
    csv_out: Path | None = None
    with zipfile.ZipFile(zip_path, "r") as z:
        for name in z.namelist():
            base = Path(name).name
            if base.startswith(".") or base == "":
                continue
            if name.endswith(".mov") and mov_out is None:
                dst = temp_dir / base
                if not dst.exists():
                    print(f"  unzipping {base} ...", flush=True)
                    with z.open(name) as src, open(dst, "wb") as fp:
                        shutil.copyfileobj(src, fp)
                mov_out = dst
            elif name.endswith("_raw.csv") and csv_out is None:
                dst = temp_dir / base
                if not dst.exists():
                    with z.open(name) as src, open(dst, "wb") as fp:
                        shutil.copyfileobj(src, fp)
                csv_out = dst
    if mov_out is None or csv_out is None:
        raise FileNotFoundError(f"missing .mov or _raw.csv inside {zip_path}")
    return mov_out, csv_out


def extract_audio(mov_path: Path, wav_path: Path, sample_rate: int = AUDIO_SR):
    """ffmpeg: .mov -> mono WAV at target sample_rate. Idempotent."""
    if wav_path.exists():
        return
    print(f"  ffmpeg -> {wav_path.name}", flush=True)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(mov_path),
        "-ac", "1", "-ar", str(sample_rate), "-vn",
        str(wav_path),
    ]
    subprocess.run(cmd, check=True)


def load_face_csv(csv_path: Path) -> np.ndarray:
    df = pd.read_csv(csv_path)
    # Columns: Timecode, BlendshapeCount, then 61 channel values
    face = df.iloc[:, 2:].values.astype(np.float32)
    if face.shape[1] != 61:
        raise ValueError(f"expected 61 channels, got {face.shape[1]} in {csv_path}")
    return face


def process_take(
    take_name: str,
    mov_path: Path,
    csv_path: Path,
    out_take_dir: Path,
) -> tuple[int, Path, Path]:
    """Produce audio.wav + face.npy for one take. Returns (n_frames, wav, npy)."""
    out_take_dir.mkdir(parents=True, exist_ok=True)
    wav_path = out_take_dir / "audio.wav"
    face_path = out_take_dir / "face.npy"

    if not wav_path.exists():
        extract_audio(mov_path, wav_path, AUDIO_SR)

    if not face_path.exists():
        face_full = load_face_csv(csv_path)
        face = face_full[:, :N_BLENDSHAPES].astype(np.float32)
        np.save(face_path, face)
    else:
        face = np.load(face_path)

    return int(face.shape[0]), wav_path, face_path


# =============================================================================
# Size reporting
# =============================================================================

def dir_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for p in path.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def human(n: int) -> str:
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}PB"


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="F:/Lipsync_Training_Data",
                        help="Root containing loose take folders and/or zip files")
    parser.add_argument("--out-dir", default="F:/Lipsync_Training_Data/prepared",
                        help="Where prepared audio.wav + face.npy go")
    parser.add_argument("--stats-dir", default="../stats")
    parser.add_argument("--temp-dir", default="F:/Lipsync_Training_Data/_tmp_unzip",
                        help="Temporary unzip directory (deleted after use)")
    parser.add_argument("--keep-temp", action="store_true",
                        help="Don't delete temp unzip directory after processing")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stats_dir = Path(args.stats_dir).resolve()
    stats_dir.mkdir(parents=True, exist_ok=True)
    temp_root = Path(args.temp_dir)

    # ---- Migrate any folders left over from the old zip-based pipeline ----
    n_migrated = migrate_legacy_prepared(out_dir)
    if n_migrated:
        print(f"migrated {n_migrated} legacy prepared folder(s) to canonical naming")

    # ---- Discover sources ----
    loose_dirs = find_loose_take_dirs(data_dir, out_dir)
    take_zips = find_take_zips(data_dir)

    # De-dup: if both a loose folder and a zip exist for the same canonical
    # take name, prefer the loose folder (it's already unpacked).
    sources: dict[str, tuple[str, Path]] = {}
    for d in loose_dirs:
        sources[normalize_take_name(d.name)] = ("loose", d)
    for z in take_zips:
        key = normalize_take_name(z.name)
        if key not in sources:
            sources[key] = ("zip", z)

    print(f"found {len(sources)} unique takes "
          f"({len(loose_dirs)} loose folders, {len(take_zips)} zips)")

    manifest = {"sample_rate": AUDIO_SR, "face_fps": 60, "takes": []}
    all_face: list[np.ndarray] = []

    processed = 0
    skipped_existing = 0
    failed: list[tuple[str, str]] = []

    for take_name in sorted(sources.keys()):
        kind, src = sources[take_name]
        out_take_dir = out_dir / take_name
        wav_path = out_take_dir / "audio.wav"
        face_path = out_take_dir / "face.npy"

        if wav_path.exists() and face_path.exists():
            face = np.load(face_path)
            n_frames = int(face.shape[0])
            skipped_existing += 1
            print(f"[{take_name}] skipping (already prepared, {n_frames} frames)")
        else:
            print(f"[{take_name}] ({kind})")
            try:
                if kind == "loose":
                    mov_path, csv_path = locate_loose_files(src)
                else:
                    temp_dir = temp_root / take_name
                    mov_path, csv_path = unpack_zip_to_temp(src, temp_dir)

                n_frames, _, _ = process_take(take_name, mov_path, csv_path, out_take_dir)
                face = np.load(face_path)
                processed += 1
            except (subprocess.CalledProcessError, FileNotFoundError,
                    ValueError, zipfile.BadZipFile) as e:
                print(f"  !! FAILED: {e}")
                failed.append((take_name, str(e).splitlines()[0][:120]))
                # Clean up any partial output so next run can retry cleanly
                for f in (wav_path, face_path):
                    try:
                        if f.exists():
                            f.unlink()
                    except OSError:
                        pass
                try:
                    if out_take_dir.exists() and not any(out_take_dir.iterdir()):
                        out_take_dir.rmdir()
                except OSError:
                    pass
                continue
            finally:
                # Always drop the temp unzip folder even if processing failed
                if kind == "zip" and not args.keep_temp:
                    try:
                        shutil.rmtree(temp_root / take_name)
                    except OSError:
                        pass

        all_face.append(face.astype(np.float32))
        dur = n_frames / 60.0
        # Store paths relative to the manifest file so the whole prepared/
        # folder is portable (zip it, upload it, it just works on any host).
        manifest["takes"].append({
            "name": take_name,
            "wav_path": f"{take_name}/audio.wav",
            "face_path": f"{take_name}/face.npy",
            "n_frames": int(n_frames),
            "duration_sec": float(dur),
        })

    if not args.keep_temp and temp_root.exists():
        try:
            shutil.rmtree(temp_root)
        except OSError:
            pass

    if not manifest["takes"]:
        print("no takes found — nothing to do")
        return

    # ---- Stats across every prepared frame ----
    all_face_arr = np.concatenate(all_face, axis=0)
    mean = all_face_arr.mean(axis=0).astype(np.float32)
    std = (all_face_arr.std(axis=0) + 1e-6).astype(np.float32)
    np.save(stats_dir / "mean.npy", mean)
    np.save(stats_dir / "std.npy", std)

    # ---- Manifest ----
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    # ---- Summary ----
    total_frames = sum(t["n_frames"] for t in manifest["takes"])
    total_sec = total_frames / 60.0
    print()
    print("=" * 70)
    print(f"{len(manifest['takes'])} takes prepared"
          f" ({processed} new, {skipped_existing} cached)")
    print(f"{total_frames:,} frames = {total_sec:.1f}s"
          f" = {total_sec/60:.2f} min = {total_sec/3600:.2f} hours")
    if failed:
        print(f"!! {len(failed)} take(s) failed and were skipped:")
        for name, msg in failed:
            print(f"   - {name}: {msg}")
    print(f"stats:    {stats_dir}")
    print(f"manifest: {manifest_path}")

    # ---- Payload breakdown (what you need to upload to cloud) ----
    audio_bytes = sum(((out_dir / t["wav_path"]).stat().st_size
                       for t in manifest["takes"]
                       if (out_dir / t["wav_path"]).exists()), start=0)
    face_bytes = sum(((out_dir / t["face_path"]).stat().st_size
                      for t in manifest["takes"]
                      if (out_dir / t["face_path"]).exists()), start=0)
    stats_bytes = dir_size(stats_dir)
    manifest_bytes = manifest_path.stat().st_size
    training_payload = audio_bytes + face_bytes + stats_bytes + manifest_bytes

    total_data_dir_bytes = dir_size(data_dir)
    prepared_bytes = dir_size(out_dir)
    non_training_bytes = total_data_dir_bytes - training_payload

    print()
    print("Cloud-upload payload (what training actually needs):")
    print(f"  audio.wav total :  {human(audio_bytes)}")
    print(f"  face.npy  total :  {human(face_bytes)}")
    print(f"  stats (mean/std):  {human(stats_bytes)}")
    print(f"  manifest.json   :  {human(manifest_bytes)}")
    print(f"  -> TOTAL         : {human(training_payload)}")
    print()
    print("For reference:")
    print(f"  entire {data_dir}:  {human(total_data_dir_bytes)}")
    print(f"  prepared/ folder (includes unused files): {human(prepared_bytes)}")
    print(f"  non-training files (.mov, .csv, .jpg...): {human(non_training_bytes)}")


if __name__ == "__main__":
    main()
