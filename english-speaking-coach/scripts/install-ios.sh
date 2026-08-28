#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash scripts/doctor-ios.sh
LAN_INTERFACE="$(
  route -n get default 2>/dev/null |
    awk '/interface:/{print $2; exit}'
)"
LAN_IP="$(
  ipconfig getifaddr "$LAN_INTERFACE" 2>/dev/null || true
)"
if [[ -z "$LAN_IP" ]]; then
  echo "Unable to detect the Mac LAN address." >&2
  exit 1
fi
echo "Embedding current Mac address: http://$LAN_IP:8785"
VITE_NATIVE_API_URL="http://$LAN_IP:8785" npm run native:sync

DEVICES_JSON="$(mktemp)"
trap 'rm -f "$DEVICES_JSON"' EXIT
xcrun devicectl list devices --json-output "$DEVICES_JSON" >/dev/null

DEVICE_ID="$(
  jq -r '
    .result.devices[]
    | select(.hardwareProperties.deviceType == "iPhone")
    | select(.hardwareProperties.reality == "physical")
    | select(.connectionProperties.pairingState == "paired")
    | select(.connectionProperties.tunnelState == "connected")
    | select(.deviceProperties.developerModeStatus == "enabled")
    | select(.deviceProperties.ddiServicesAvailable == true)
    | .identifier
  ' "$DEVICES_JSON" | head -1
)"

DEVICE_UDID="$(
  jq -r '
    .result.devices[]
    | select(.identifier == $device_id)
    | .hardwareProperties.udid // empty
  ' --arg device_id "$DEVICE_ID" "$DEVICES_JSON"
)"

if [[ -z "$DEVICE_ID" || -z "$DEVICE_UDID" ]]; then
  echo "No paired iPhone with Developer Mode enabled was found." >&2
  exit 1
fi

TEAM_ID="$(
  defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier 2>/dev/null |
    sed -nE 's/^[[:space:]]*teamID = ([A-Z0-9]{10});/\1/p' |
    head -1
)"

if [[ -z "$TEAM_ID" ]]; then
  echo "Unable to detect an Xcode development team." >&2
  exit 1
fi

DERIVED_DATA="$ROOT_DIR/.local/ios-derived-data"

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "id=$DEVICE_UDID" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  build

APP_PATH="$DERIVED_DATA/Build/Products/Debug-iphoneos/App.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Built app was not found at $APP_PATH" >&2
  exit 1
fi

xcrun devicectl device install app \
  --device "$DEVICE_ID" \
  "$APP_PATH"

echo
echo "EasySay was installed on the connected iPhone."
