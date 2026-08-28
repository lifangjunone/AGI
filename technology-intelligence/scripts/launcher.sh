#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
exec /usr/bin/python3 "$SCRIPT_DIR/technology_explorer.py"
