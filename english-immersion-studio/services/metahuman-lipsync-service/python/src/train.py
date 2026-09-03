"""
Training loop for LipSyncModel v2.

v2 changes vs v1:
    - Mixed precision (bfloat16 autocast) on CUDA for ~2x speedup on 5090
    - Bigger batch (64) + longer windows (3s / 180 frames)
    - More steps (100 epochs × 500 steps = 50k total)
    - Proportional-to-length sampling via the flat dataset index
    - Trimmed checkpoint (saves only the ~25M trainable params, not the
      frozen 315M audio encoder — checkpoint drops from 784MB to ~100MB)
    - Per-channel validation metrics split into mouth / secondary / other
    - Encoder choice exposed via --encoder-name
    - num-workers defaults to 4 (set to 0 manually if you're on Windows)

Loss:
    weighted L1     — heavy on mouth/jaw, light elsewhere
    velocity L1     — first-derivative match, encourages temporal smoothness
    acceleration L1 — second-derivative match, reduces jitter
"""
from __future__ import annotations

import argparse
import copy
import math
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.optim.lr_scheduler import LambdaLR
from torch.utils.data import DataLoader, RandomSampler

from constants import (
    MOUTH_INDICES, N_BLENDSHAPES, SECONDARY_MOUTH_INDICES, make_channel_weights,
)
from dataset import LipSyncDataset
from model import LipSyncModel


# ----------------------------------------------------------------------
# EMA — operates only on trainable params (the frozen encoder is never
# updated so copying it would just waste memory).
# ----------------------------------------------------------------------
def ema_update(ema_model: nn.Module, model: nn.Module, decay: float = 0.999):
    with torch.no_grad():
        for (ek, ep), (mk, mp) in zip(
            ema_model.named_parameters(), model.named_parameters()
        ):
            if mp.requires_grad:
                ep.data.mul_(decay).add_(mp.data, alpha=1.0 - decay)
            else:
                ep.data.copy_(mp.data)
        for eb, mb in zip(ema_model.buffers(), model.buffers()):
            eb.data.copy_(mb.data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="F:/Lipsync_Training_Data/prepared/manifest.json")
    parser.add_argument("--stats-dir", default="../stats")
    parser.add_argument("--ckpt-dir", default="../checkpoints")

    # --- Model ---
    parser.add_argument("--encoder-name", default="hubert_large",
                        choices=["wav2vec2_base", "wav2vec2_large",
                                 "hubert_base", "hubert_large", "hubert_xlarge",
                                 "wavlm_base", "wavlm_large"])
    parser.add_argument("--hidden", type=int, default=512)
    parser.add_argument("--n-layers", type=int, default=8)
    parser.add_argument("--n-heads", type=int, default=8)
    parser.add_argument("--ff-dim", type=int, default=2048)
    parser.add_argument("--dropout", type=float, default=0.30)

    # --- Data ---
    parser.add_argument("--window-frames", type=int, default=180)   # 3s @ 60fps
    parser.add_argument("--val-stride", type=int, default=30)
    parser.add_argument("--silence-prob", type=float, default=0.15,
                        help="Fraction of train windows replaced with "
                             "(silence, closed-mouth) pairs")

    # --- Training ---
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--steps-per-epoch", type=int, default=500)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--weight-decay", type=float, default=0.03)
    parser.add_argument("--warmup-epochs", type=int, default=5)
    parser.add_argument("--velocity-weight", type=float, default=1.0)
    parser.add_argument("--acc-weight", type=float, default=0.5)
    parser.add_argument("--quantile", type=float, default=0.7,
                        help="Quantile for the main loss. 0.5=standard L1 (median), "
                             "0.7=biases toward higher activations (model predicts "
                             "the 70th percentile, penalizing under-prediction 2.3x "
                             "more than over-prediction).")
    parser.add_argument("--ema-decay", type=float, default=0.9995)
    parser.add_argument("--grad-clip", type=float, default=1.0)

    parser.add_argument("--amp", action="store_true", default=True,
                        help="Enable bfloat16 autocast on CUDA (default on)")
    parser.add_argument("--no-amp", dest="amp", action="store_false")

    parser.add_argument("--num-workers", type=int, default=4,
                        help="DataLoader workers (set to 0 on Windows)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)

    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif torch.backends.mps.is_available() and torch.backends.mps.is_built():
        device = torch.device("mps")  # Apple Silicon GPU
    else:
        device = torch.device("cpu")
    print(f"[train] device: {device}")
    if device.type == "cuda":
        print(f"[train] gpu:    {torch.cuda.get_device_name(0)}")
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True

    use_amp = args.amp and device.type == "cuda"
    amp_dtype = torch.bfloat16 if use_amp else torch.float32
    print(f"[train] amp:    {'bf16' if use_amp else 'off'}")

    ckpt_dir = Path(args.ckpt_dir).resolve()
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    # --- Data ---
    train_ds = LipSyncDataset(
        args.manifest, args.stats_dir, args.window_frames,
        split="train", silence_prob=args.silence_prob)
    val_ds = LipSyncDataset(
        args.manifest, args.stats_dir, args.window_frames,
        split="val", val_stride=args.val_stride)

    samples_per_epoch = args.batch_size * args.steps_per_epoch
    train_sampler = RandomSampler(
        train_ds, replacement=True, num_samples=samples_per_epoch)
    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, sampler=train_sampler,
        num_workers=args.num_workers, drop_last=True,
        pin_memory=(device.type == "cuda"))
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size, shuffle=False,
        num_workers=args.num_workers,
        pin_memory=(device.type == "cuda"))

    # --- Model ---
    model = LipSyncModel(
        n_channels=N_BLENDSHAPES,
        encoder_name=args.encoder_name,
        hidden=args.hidden, n_layers=args.n_layers,
        n_heads=args.n_heads, ff_dim=args.ff_dim,
        dropout=args.dropout,
    ).to(device)

    ema_model = copy.deepcopy(model).eval()
    for p in ema_model.parameters():
        p.requires_grad = False

    n_trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    n_total = sum(p.numel() for p in model.parameters())
    n_frozen = n_total - n_trainable
    print(f"[train] params: {n_trainable/1e6:.2f}M trainable "
          f"/ {n_frozen/1e6:.2f}M frozen / {n_total/1e6:.2f}M total")

    # --- Optim (only trainable params) ---
    optim = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad],
        lr=args.lr, weight_decay=args.weight_decay, betas=(0.9, 0.98))

    total_steps = args.epochs * len(train_loader)
    warmup_steps = args.warmup_epochs * len(train_loader)

    def lr_lambda(step: int) -> float:
        if step < warmup_steps:
            return (step + 1) / max(1, warmup_steps)
        progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
        return 0.5 * (1.0 + math.cos(math.pi * progress))

    scheduler = LambdaLR(optim, lr_lambda)

    ch_weights = torch.from_numpy(make_channel_weights()).to(device)  # [52]
    mouth_idx_t = torch.tensor(MOUTH_INDICES, device=device, dtype=torch.long)
    secondary_idx_t = torch.tensor(SECONDARY_MOUTH_INDICES, device=device, dtype=torch.long)

    q = args.quantile

    def loss_fn(pred: torch.Tensor, target: torch.Tensor):
        # Quantile (asymmetric) L1: q>0.5 penalizes under-prediction more
        # than over-prediction, biasing the model toward higher activations.
        # At q=0.7 under-prediction is penalized 2.33x more → the model
        # learns to predict the ~70th percentile instead of the median.
        residual = target - pred  # positive when pred < target
        ql = torch.where(residual > 0, q * residual, -(1.0 - q) * residual)
        ql = (ql * ch_weights).mean()

        # Velocity and acceleration losses stay symmetric L1 — we want
        # temporal accuracy, not exaggerated dynamics.
        pred_v = pred[:, 1:] - pred[:, :-1]
        tgt_v = target[:, 1:] - target[:, :-1]
        v_loss = ((pred_v - tgt_v).abs() * ch_weights).mean()
        pred_a = pred_v[:, 1:] - pred_v[:, :-1]
        tgt_a = tgt_v[:, 1:] - tgt_v[:, :-1]
        a_loss = ((pred_a - tgt_a).abs() * ch_weights).mean()
        return ql + args.velocity_weight * v_loss + args.acc_weight * a_loss, ql, v_loss, a_loss

    # ------------------------------------------------------------------
    # Training loop
    # ------------------------------------------------------------------
    best_val = float("inf")
    t_start = time.time()

    for epoch in range(args.epochs):
        model.train()
        t_ep = time.time()
        ep_total = 0.0
        ep_l1 = 0.0
        ep_v = 0.0

        for audio, face in train_loader:
            audio = audio.to(device, non_blocking=True)
            face = face.to(device, non_blocking=True)

            with torch.autocast(device_type=device.type, dtype=amp_dtype,
                                 enabled=use_amp):
                pred = model(audio, face.size(1))
                loss, l1, v_loss, _a = loss_fn(pred, face)

            optim.zero_grad(set_to_none=True)
            loss.backward()
            if args.grad_clip > 0:
                torch.nn.utils.clip_grad_norm_(
                    [p for p in model.parameters() if p.requires_grad],
                    max_norm=args.grad_clip)
            optim.step()
            scheduler.step()
            ema_update(ema_model, model, args.ema_decay)

            ep_total += loss.item()
            ep_l1 += l1.item()
            ep_v += v_loss.item()

        n_batches = max(1, len(train_loader))
        ep_total /= n_batches
        ep_l1 /= n_batches
        ep_v /= n_batches

        # ------------ Validation ------------
        ema_model.eval()
        val_total = 0.0
        val_l1 = 0.0
        val_batches = 0
        # Per-channel unweighted L1 accumulator [52]
        per_ch = torch.zeros(N_BLENDSHAPES, device=device)
        with torch.no_grad():
            for audio, face in val_loader:
                audio = audio.to(device, non_blocking=True)
                face = face.to(device, non_blocking=True)
                with torch.autocast(device_type=device.type, dtype=amp_dtype,
                                     enabled=use_amp):
                    pred = ema_model(audio, face.size(1))
                    loss, l1, _v, _a = loss_fn(pred, face)
                val_total += loss.item()
                val_l1 += l1.item()
                per_ch += (pred - face).abs().mean(dim=(0, 1)).float()
                val_batches += 1
            if val_batches > 0:
                val_total /= val_batches
                val_l1 /= val_batches
                per_ch /= val_batches

        mouth_l1 = per_ch.index_select(0, mouth_idx_t).mean().item()
        secondary_l1 = per_ch.index_select(0, secondary_idx_t).mean().item()

        lr_now = optim.param_groups[0]["lr"]
        print(f"epoch {epoch+1:3d}/{args.epochs}  "
              f"train_loss={ep_total:.4f}  train_l1={ep_l1:.4f}  "
              f"val_loss={val_total:.4f}  val_l1={val_l1:.4f}  "
              f"mouth={mouth_l1:.4f}  2nd={secondary_l1:.4f}  "
              f"lr={lr_now:.2e}  {time.time()-t_ep:.1f}s", flush=True)

        if val_l1 < best_val:
            best_val = val_l1
            torch.save({
                "trainable_ema": ema_model.trainable_state_dict(),
                "args": vars(args),
                "epoch": epoch,
                "val_l1": float(val_l1),
                "mouth_l1": float(mouth_l1),
                "encoder_name": args.encoder_name,
            }, ckpt_dir / "best.pt")
            print(f"  -> saved best.pt (val_l1 {val_l1:.4f})", flush=True)

    # Always save the final EMA state too
    torch.save({
        "trainable_ema": ema_model.trainable_state_dict(),
        "args": vars(args),
        "epoch": args.epochs - 1,
        "val_l1": float(val_l1),
        "encoder_name": args.encoder_name,
    }, ckpt_dir / "last.pt")

    print(f"\ndone in {(time.time()-t_start)/60:.1f} min. best val_l1 = {best_val:.4f}")


if __name__ == "__main__":
    main()
