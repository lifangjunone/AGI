#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUPPORT_DIR="$HOME/Library/Application Support/Opportunity Factory"
ENV_FILE="$SUPPORT_DIR/.env"
RUNNER="$SUPPORT_DIR/run.sh"
SERVICE_COPY="$SUPPORT_DIR/autonomous_factory.py"
LABEL="com.local.opportunity-factory"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$SUPPORT_DIR" "$HOME/Library/LaunchAgents"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
OPPORTUNITY_FACTORY_HOME="$SUPPORT_DIR/runtime"
FACTORY_HOST=127.0.0.1
FACTORY_PORT=8792
PUBLIC_URL=https://audit.lifeyoume.icu
SCAN_SECONDS=900
ADMIN_PASSWORD=$(openssl rand -hex 24)
IP_HASH_SALT=$(openssl rand -hex 24)
ALLOW_AUTONOMOUS_OUTREACH=0
EOF
  chmod 0600 "$ENV_FILE"
fi

install -m 0755 "$PROJECT_DIR/service/autonomous_factory.py" "$SERVICE_COPY"
cat > "$RUNNER" <<EOF
#!/bin/bash
set -euo pipefail
set -a
source "$ENV_FILE"
set +a
exec /usr/bin/python3 "$SERVICE_COPY" serve
EOF
chmod 0700 "$RUNNER"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$RUNNER</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$SUPPORT_DIR/service.log</string>
  <key>StandardErrorPath</key>
  <string>$SUPPORT_DIR/service.error.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 1
curl --fail --silent http://127.0.0.1:8792/healthz
echo
echo "Opportunity Factory is running locally on http://127.0.0.1:8792"
