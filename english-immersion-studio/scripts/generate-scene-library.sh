#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/public/scenes"
MODEL="mlx-community/flux2-klein-4b-4bit"
BASE_MODEL="flux2-klein-4b"

mkdir -p "$OUTPUT_DIR"

generate_scene() {
  local name="$1"
  local prompt="$2"
  local seed="$3"

  mflux-generate-flux2 \
    --model "$MODEL" \
    --base-model "$BASE_MODEL" \
    --prompt "$prompt" \
    --width 1024 \
    --height 576 \
    --steps 4 \
    --seed "$seed" \
    --output "$OUTPUT_DIR/${name}.jpg" \
    --no-metadata
}

COMMON="Photorealistic empty environment for a premium immersive language-learning application, eye-level first-person composition with open foreground space for a 3D conversation partner, cinematic but clear commercial interior photography, realistic materials, balanced depth, no people, no text, no logos, no watermark."

generate_scene "interview" "$COMMON Modern London executive office on a bright overcast morning, floor-to-ceiling windows, warm oak meeting table and one chair, refined restrained atmosphere." 41001
generate_scene "restaurant" "$COMMON Upscale Manhattan restaurant at evening, intimate amber table lamps, emerald banquettes, set dinner table, visible open kitchen, sophisticated lively atmosphere." 41002
generate_scene "hotel" "$COMMON Luxury Singapore hotel reception, tropical modern architecture, marble desk, fresh orchids, warm sunset through tall windows, elegant arrival atmosphere." 41003
generate_scene "small-talk" "$COMMON Stylish Melbourne laneway cafe in the afternoon, terrazzo counter, sunlight with leafy shadows, two coffees on a small table, relaxed social atmosphere." 41004
generate_scene "clinic" "$COMMON Premium modern medical consultation room in daylight, warm wood details, clean but reassuring atmosphere, desk and two chairs." 41005
generate_scene "airport" "$COMMON Premium aircraft cabin at blue hour, soft reading lights, window view above clouds, quiet sophisticated travel atmosphere." 41006
