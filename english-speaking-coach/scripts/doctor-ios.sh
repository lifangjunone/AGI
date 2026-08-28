#!/usr/bin/env bash
set -euo pipefail

FAILED=0
DEVICES_JSON="$(mktemp)"
trap 'rm -f "$DEVICES_JSON"' EXIT

echo "EasySay iPhone build diagnostics"
echo

if [[ -d /Applications/Xcode.app ]]; then
  echo "ok   Xcode installed"
else
  echo "fail Xcode is not installed"
  FAILED=1
fi

if xcodebuild -version >/dev/null 2>&1; then
  echo "ok   $(xcodebuild -version | tr '\n' ' ')"
else
  echo "fail xcodebuild is unavailable"
  FAILED=1
fi

if xcrun devicectl list devices --json-output "$DEVICES_JSON" >/dev/null 2>&1; then
  DEVICE_NAME="$(
    jq -r '
      .result.devices[]
      | select(.hardwareProperties.deviceType == "iPhone")
      | select(.hardwareProperties.reality == "physical")
      | select(.connectionProperties.pairingState == "paired")
      | .deviceProperties.name
    ' "$DEVICES_JSON" | head -1
  )"
  DEVELOPER_MODE="$(
    jq -r '
      .result.devices[]
      | select(.hardwareProperties.deviceType == "iPhone")
      | select(.hardwareProperties.reality == "physical")
      | select(.connectionProperties.pairingState == "paired")
      | .deviceProperties.developerModeStatus // "unknown"
    ' "$DEVICES_JSON" | head -1
  )"
  CONNECTION_STATE="$(
    jq -r '
      .result.devices[]
      | select(.hardwareProperties.deviceType == "iPhone")
      | select(.hardwareProperties.reality == "physical")
      | select(.connectionProperties.pairingState == "paired")
      | .connectionProperties.tunnelState // "unavailable"
    ' "$DEVICES_JSON" | head -1
  )"
  DDI_READY="$(
    jq -r '
      .result.devices[]
      | select(.hardwareProperties.deviceType == "iPhone")
      | select(.hardwareProperties.reality == "physical")
      | select(.connectionProperties.pairingState == "paired")
      | .deviceProperties.ddiServicesAvailable // false
    ' "$DEVICES_JSON" | head -1
  )"
else
  DEVICE_NAME=""
  DEVELOPER_MODE="unknown"
  CONNECTION_STATE="unavailable"
  DDI_READY="false"
fi

if [[ -n "$DEVICE_NAME" ]]; then
  echo "ok   iPhone paired: $DEVICE_NAME"
else
  echo "fail No paired iPhone detected"
  FAILED=1
fi

if [[ "$DEVELOPER_MODE" == "enabled" ]]; then
  echo "ok   iPhone Developer Mode enabled"
else
  echo "fail iPhone Developer Mode is $DEVELOPER_MODE"
  echo "     On iPhone open Settings → Privacy & Security → Developer Mode."
  FAILED=1
fi

if [[ "$CONNECTION_STATE" == "connected" && "$DDI_READY" == "true" ]]; then
  echo "ok   iPhone available for installation"
else
  echo "fail iPhone is paired but not currently available"
  echo "     Connect it by cable or keep it unlocked on the same Wi-Fi."
  FAILED=1
fi

IDENTITIES="$(security find-identity -v -p codesigning 2>/dev/null || true)"
if grep -q "Apple Development" <<<"$IDENTITIES"; then
  echo "ok   Apple Development signing identity"
else
  echo "fail Apple Development signing identity is missing"
  echo "     Open Xcode → Settings → Accounts and add your Apple ID."
  FAILED=1
fi

if [[ -f ios/App/App.xcodeproj/project.pbxproj ]]; then
  echo "ok   EasySay iOS project"
else
  echo "fail EasySay iOS project is missing"
  FAILED=1
fi

exit "$FAILED"
