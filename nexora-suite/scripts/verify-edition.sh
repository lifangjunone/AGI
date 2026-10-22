#!/usr/bin/env bash
set -euo pipefail

EDITION="${1:-full}"
CORE_URL="${CORE_URL:-http://localhost:8080}"
STUDIO_URL="${STUDIO_URL:-http://localhost:8081}"
CONTROL_URL="${CONTROL_URL:-http://localhost:8082}"
MAAS_URL="${MAAS_URL:-http://localhost:8083}"

LOGIN_RESPONSE="$(curl -fsS "$CORE_URL/api/v1/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@nexora.local","password":"Nexora123!"}')"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | sed -E 's/.*"access_token":"([^"]+)".*/\1/')"
AUTH="Authorization: Bearer $TOKEN"

verify_studio() {
  local response agent_id publish
  response="$(curl -fsS "$STUDIO_URL/api/v1/agents" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"Edition Test Agent","description":"Deployment edition acceptance"}')"
  agent_id="$(printf '%s' "$response" | sed -E 's/^\{"ID":"([^"]+)".*/\1/')"
  curl -fsS -X POST "$STUDIO_URL/api/v1/agents/$agent_id/debug" -H "$AUTH" -H 'Content-Type: application/json' -d '{"input":"hello"}' >/dev/null
  publish="$(curl -fsS -X POST "$STUDIO_URL/api/v1/agents/$agent_id/publish" -H "$AUTH")"
  if [ "$EDITION" = "studio" ]; then
    printf '%s' "$publish" | grep -q '"control_integration":false'
  else
    printf '%s' "$publish" | grep -q '"control_registered":true'
  fi
}

verify_control() {
  local registry
  curl -fsS "$CONTROL_URL/api/v1/agents" -H "$AUTH" -H 'Content-Type: application/json' \
    -d '{"external_id":"edition-test","name":"Customer External Agent","source":"external","version":"1.0.0","endpoint":"https://agent.customer.example/invoke","capabilities":["chat"]}' >/dev/null
  registry="$(curl -fsS "$CONTROL_URL/api/v1/agents" -H "$AUTH")"
  printf '%s' "$registry" | grep -q 'Customer External Agent'
}

verify_maas() {
  local provider model route
  provider="$(curl -fsS "$MAAS_URL/api/v1/providers" -H "$AUTH" -H 'Content-Type: application/json' \
    -d '{"name":"Edition Test Provider","kind":"openai-compatible","base_url":"https://models.customer.example/v1","api_key":"test-secret"}')"
  provider_id="$(printf '%s' "$provider" | sed -E 's/.*"id":"([^"]+)".*/\1/')"
  printf '%s' "$provider" | grep -vq 'test-secret'
  model="$(curl -fsS "$MAAS_URL/api/v1/models" -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Edition Test Model\",\"provider_id\":\"$provider_id\",\"upstream_model\":\"test-model\",\"context_window\":128000}")"
  model_id="$(printf '%s' "$model" | sed -E 's/.*"id":"([^"]+)".*/\1/')"
  route="$(curl -fsS "$MAAS_URL/api/v1/routes" -H "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"name\":\"Edition Test Route\",\"alias\":\"edition-test\",\"model_id\":\"$model_id\"}")"
  printf '%s' "$route" | grep -q '"alias":"edition-test"'
}

case "$EDITION" in
  studio) verify_studio ;;
  control) verify_control ;;
  maas) verify_maas ;;
  full) verify_studio; verify_control; verify_maas ;;
  *) echo "usage: $0 studio|control|maas|full" >&2; exit 2 ;;
esac

echo "Nexora $EDITION edition verification passed."
