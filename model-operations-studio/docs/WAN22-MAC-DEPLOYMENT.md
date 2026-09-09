# Wan2.2-TI2V-5B on Apple Silicon

Last verified: 2026-09-09

## Decision

Wan2.2-TI2V-5B remains the preferred open-weight model under the 10B limit for this M5 Pro 48 GB machine, but its MPS status is **supported with a quality caveat**, not universally stable.

The official ComfyUI workflow supports the 5B hybrid model for both text-to-video and image-to-video. ComfyUI itself supports Apple Silicon and ships a macOS Desktop build. However, an open ComfyUI issue from 2026-07-20 reproduces progressive vertical banding and saturation corruption on M4 Max/MPS with the native FP16 5B model, FP8 UMT5, `uni_pc`, CFG 5, and 49 frames. This project removes three variables from that reproduction: FP8 text encoding, `uni_pc`, and non-tiled decoding.

At verification time the issue remains open, with no linked fix. The latest tagged ComfyUI release is `v0.34.0` (2026-08-26); this installation uses source commit `54e03f5367ebd8d96380e4cf02fa3084f7a7eca5` from 2026-09-08 so the benchmark reflects code newer than that release.

Sources:

- Official workflow and file layout: https://docs.comfy.org/tutorials/video/wan/wan2_2
- Official example workflow: https://comfyanonymous.github.io/ComfyUI_examples/wan22/
- Apple Silicon banding report: https://github.com/Comfy-Org/ComfyUI/issues/15010
- ComfyUI platform and Python requirements: https://docs.comfy.org/installation/system_requirements

## Installation Choice

For ordinary interactive use, ComfyUI Desktop is the lowest-maintenance option. For a reproducible MaaS service, source installation is preferable because the control plane can pin the repository state, own the Python environment, launch the API headlessly, and inspect logs.

This project therefore uses:

1. ComfyUI source under `runtime/ComfyUI`.
2. An isolated Python 3.13 environment at `runtime/ComfyUI/.venv`.
3. Native core nodes only.
4. MPS fallback enabled for unsupported operations.
5. A localhost-only ComfyUI API on port `8188`.

Manual equivalent:

```bash
git clone https://github.com/Comfy-Org/ComfyUI.git runtime/ComfyUI
uv venv --python 3.13 runtime/ComfyUI/.venv
uv pip install --python runtime/ComfyUI/.venv/bin/python -r runtime/ComfyUI/requirements.txt
PYTORCH_ENABLE_MPS_FALLBACK=1 \
PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0 \
runtime/ComfyUI/.venv/bin/python runtime/ComfyUI/main.py \
  --listen 127.0.0.1 --port 8188 --use-pytorch-cross-attention --reserve-vram 8
```

## Required Artifacts

All sizes and SHA-256 values come from the Hugging Face repository API.

| Artifact | Bytes | Target | Download |
| --- | ---: | --- | --- |
| `wan2.2_ti2v_5B_fp16.safetensors` | 9,999,658,848 | `models/diffusion_models/` | [Hugging Face](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors) |
| `umt5_xxl_fp16.safetensors` | 11,366,399,385 | `models/text_encoders/` | [Hugging Face](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp16.safetensors) |
| `wan2.2_vae.safetensors` | 1,409,400,960 | `models/vae/` | [Hugging Face](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors) |

SHA-256 values are pinned in [`../data/model-catalog.json`](../data/model-catalog.json) and verified before any artifact is promoted from `.part` to its final path.

Repository: https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files

## Recovery Policy

The first attempt is always `832x480`, 49 frames, 20 steps, Euler, CFG 5, 16 fps, tiled VAE decode.

If ComfyUI reports an MPS allocation error or the output fails decoding/black-frame checks:

1. Keep Euler and tiled decode; reduce to 33 frames.
2. Reduce resolution to `640x368`.
3. Reduce to `512x288`, 25 frames, 16 steps, CFG 4.
4. Do not silently switch to FP8 or `uni_pc`.

Vertical banding is not reliably detectable from process exit status. The benchmark records machine-verifiable corruption and black-frame checks, but final temporal/artifact quality still requires human review before the configuration is marked production-stable.
