#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$PROJECT_DIR/dist/Technology Exploration.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"
clang -fobjc-arc -O2 \
  -framework Cocoa -framework WebKit \
  "$PROJECT_DIR/native/NativeShell.m" \
  -o "$MACOS_DIR/TechnologyExplorer"
cp "$PROJECT_DIR/app/technology_explorer.py" "$RESOURCES_DIR/technology_explorer.py"
cp "$PROJECT_DIR/AgentPrompt.md" "$RESOURCES_DIR/AgentPrompt.md"
cp "$PROJECT_DIR/DATA_SOURCE_SETUP.md" "$RESOURCES_DIR/DATA_SOURCE_SETUP.md"
cp "$PROJECT_DIR/assets/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"
cp "$PROJECT_DIR/Info.plist" "$CONTENTS_DIR/Info.plist"
xattr -cr "$APP_DIR"
codesign --force --deep --sign - "$APP_DIR"
echo "$APP_DIR"
