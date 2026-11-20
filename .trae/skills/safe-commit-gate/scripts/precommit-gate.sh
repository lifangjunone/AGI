#!/usr/bin/env bash
# Deterministic pre-commit gate for the LifeYouMe monorepo.
# Run from the repository root after staging the intended paths.
# Exit non-zero on any blocking finding.
set -u

fail=0

# Nothing staged: nothing to gate, exit cleanly so the caller can decide.
if [ -z "$(git diff --cached --name-only)" ]; then
  echo "precommit-gate: no staged changes, nothing to check"
  exit 0
fi

echo "== 1. Staged blobs over 10 MB =="
large="$(git diff --cached --name-only -z | while IFS= read -r -d '' path; do
  size=$(git cat-file -s ":$path" 2>/dev/null || echo 0)
  if [ "$size" -ge 10000000 ]; then
    printf '%s %s\n' "$size" "$path"
  fi
done | sort -nr)"
if [ -n "$large" ]; then
  echo "$large"
  echo "BLOCK: unstage the oversized blobs before committing."
  fail=1
else
  echo "ok: no staged blob >= 10 MB"
fi

echo "== 2. High-confidence secrets in staged diff =="
high="$(git diff --cached -U0 | rg -n \
  -e '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----' \
  -e 'AKIA[0-9A-Z]{16}' \
  -e 'ASIA[0-9A-Z]{16}' \
  -e 'github_pat_[A-Za-z0-9_]{20,}' \
  -e 'gh[pousr]_[A-Za-z0-9_]{20,}' \
  -e 'xox[baprs]-[A-Za-z0-9-]{10,}' || true)"
if [ -n "$high" ]; then
  echo "$high"
  echo "BLOCK: remove the high-confidence secret."
  fail=1
else
  echo "ok: no private keys or cloud/SCM tokens"
fi

echo "== 3. Hardcoded credential assignments =="
# Environment reads and obvious fixtures are allowed; flag everything else for review.
creds="$(git diff --cached -U0 | rg -n -i \
  '(api[_-]?key|client[_-]?secret|access[_-]?token|password|passwd)[[:space:]]*[:=][[:space:]]*[^[:space:]]{8,}' \
  | rg -v 'process\.env|env\.|os\.environ|example|placeholder|your-|test|fixture|dummy|fake|sample' || true)"
if [ -n "$creds" ]; then
  echo "$creds"
  echo "REVIEW: confirm none of these are real hardcoded credentials."
fi

echo "== 4. Whitespace errors =="
if ! git diff --cached --check; then
  echo "BLOCK: fix trailing whitespace or EOF blank lines, then re-stage."
  fail=1
else
  echo "ok: diff is whitespace-clean"
fi

if [ "$fail" -ne 0 ]; then
  echo "precommit-gate: FAILED"
  exit 1
fi
echo "precommit-gate: PASSED"
