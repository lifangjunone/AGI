#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$PROJECT_DIR/dist/商机罗盘.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

mkdir -p "$PROJECT_DIR/assets" "$MACOS_DIR" "$RESOURCES_DIR"

if [[ ! -f "$PROJECT_DIR/assets/AppIcon.icns" ]]; then
  swift "$PROJECT_DIR/scripts/generate_icon.swift" "$PROJECT_DIR/assets"
  iconutil -c icns "$PROJECT_DIR/assets/AppIcon.iconset" -o "$PROJECT_DIR/assets/AppIcon.icns"
fi

clang -fobjc-arc -O2 \
  -framework Cocoa \
  -framework WebKit \
  "$PROJECT_DIR/native/NativeShell.m" \
  -o "$MACOS_DIR/OpportunityCompass"

cp "$PROJECT_DIR/app/opportunity_engine.py" "$RESOURCES_DIR/opportunity_engine.py"
cp "$PROJECT_DIR/assets/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"
cp "$PROJECT_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"

xattr -cr "$APP_DIR"
codesign --force --deep --sign - "$APP_DIR"
codesign --verify --deep --strict "$APP_DIR"
echo "$APP_DIR"
