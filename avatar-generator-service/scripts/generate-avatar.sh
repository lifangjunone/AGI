#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_GLB="${1:?source GLB is required}"
REFERENCE_IMAGE="${2:?reference image is required}"
OUTPUT_GLB="${3:?output GLB is required}"
WEIGHTS_DIR="${AVATAR_PAINT_WEIGHTS:-$ROOT_DIR/weights/raw}"
HY3D_BIN="$ROOT_DIR/vendor/hunyuan3d-swift/.build/release/hy3d"
PAINTED_GLB="${OUTPUT_GLB%.glb}.painted.glb"

if [[ ! -x "$HY3D_BIN" ]]; then
  swift build -c release --package-path "$ROOT_DIR/vendor/hunyuan3d-swift"
fi

if [[ ! -f "$WEIGHTS_DIR/unet/diffusion_pytorch_model.safetensors" ]]; then
  echo "Missing Hunyuan3D Paint weights in $WEIGHTS_DIR" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUTPUT_GLB")"

"$HY3D_BIN" paint \
  "$SOURCE_GLB" \
  "$REFERENCE_IMAGE" \
  -o "$PAINTED_GLB" \
  --weights "$WEIGHTS_DIR" \
  --model pbr \
  --res "${AVATAR_PAINT_RESOLUTION:-512}" \
  --steps "${AVATAR_PAINT_STEPS:-15}" \
  --tex "${AVATAR_TEXTURE_SIZE:-2048}" \
  --no-superres

node "$ROOT_DIR/scripts/merge-rigged-texture.mjs" \
  "$SOURCE_GLB" \
  "$PAINTED_GLB" \
  "$OUTPUT_GLB"
