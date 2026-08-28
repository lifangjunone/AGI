#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PACKAGE_DIR="$ROOT_DIR/sidecars/macos-computer-use"
RESOURCE_DIR="$ROOT_DIR/src-tauri/resources"
APP_DIR="$RESOURCE_DIR/DeliveryPilot Computer Use.app"

BIN_DIR=$(swift build --disable-sandbox -c release --package-path "$PACKAGE_DIR" --show-bin-path)
swift build --disable-sandbox -c release --package-path "$PACKAGE_DIR"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
cp "$PACKAGE_DIR/Info.plist" "$APP_DIR/Contents/Info.plist"
cp "$BIN_DIR/delivery-computer-use" "$APP_DIR/Contents/MacOS/delivery-computer-use"
chmod 755 "$APP_DIR/Contents/MacOS/delivery-computer-use"
codesign --force --sign - \
  --identifier com.deliverypilot.computer-use \
  --requirements '=designated => identifier "com.deliverypilot.computer-use"' \
  "$APP_DIR"
