#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/public/faces"
MODEL="mlx-community/flux2-klein-4b-4bit"
BASE_MODEL="flux2-klein-4b"

mkdir -p "$OUTPUT_DIR"

generate_style() {
  local style="$1"
  local prompt="$2"
  local seed_start="$3"
  local seeds=()

  for index in $(seq 0 9); do
    seeds+=("$((seed_start + index))")
  done

  mflux-generate-flux2 \
    --model "$MODEL" \
    --base-model "$BASE_MODEL" \
    --prompt "$prompt" \
    --width 768 \
    --height 768 \
    --steps 4 \
    --seed "${seeds[@]}" \
    --output "$OUTPUT_DIR/${style}.jpg" \
    --no-metadata

  for index in $(seq 0 9); do
    local seed="$((seed_start + index))"
    local number
    number="$(printf '%02d' "$((index + 1))")"
    mv "$OUTPUT_DIR/${style}_seed_${seed}.jpg" "$OUTPUT_DIR/${style}-${number}.jpg"
  done
}

COMMON="Photorealistic premium beauty headshot of an entirely fictional adult East Asian woman age 25 to 32, not a real person and not resembling any celebrity. Centered front-facing head and shoulders, direct eye contact, realistic skin pores and facial anatomy, balanced facial symmetry, hair clear of the central face, dark neutral studio background, high-end commercial portrait photography, tasteful non-explicit styling, no text, no watermark, not cartoon, not anime, not a doll."

generate_style \
  "k-stage" \
  "$COMMON Contemporary Korean pop stage beauty styling, sophisticated luminous makeup, refined eyeliner, elegant dark hair, confident stage presence." \
  31001

generate_style \
  "j-fashion" \
  "$COMMON Modern Japanese adult fashion editorial styling, refined Tokyo beauty makeup, glossy dark hair, understated sensual confidence." \
  32001

generate_style \
  "executive" \
  "$COMMON Mature international executive styling, polished professional makeup, composed intelligent expression, impeccably styled dark hair." \
  33001
