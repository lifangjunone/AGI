#!/bin/bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="$ROOT/.git/auto-sync.lock"
REMOTE="${AUTO_SYNC_REMOTE:-origin}"
MAX_FILE_BYTES="${AUTO_SYNC_MAX_FILE_BYTES:-95000000}"
DRY_RUN=0

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "Another auto-sync process is already running; skipping."
  exit 0
fi
trap cleanup EXIT INT TERM

cd "$ROOT"

if [[ ! -d .git ]]; then
  log "The workspace root is not a Git repository: $ROOT"
  exit 1
fi

branch="$(git branch --show-current)"
if [[ -z "$branch" ]]; then
  log "Detached HEAD is not supported; skipping."
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  log "Git remote '$REMOTE' is not configured."
  exit 1
fi

missing_project_docs=0
for project_readme in "$ROOT"/*/README.md; do
  [[ -f "$project_readme" ]] || continue
  project="$(basename "$(dirname "$project_readme")")"
  if ! grep -Fq "($project/README.md)" "$ROOT/README.md"; then
    log "README.md does not contain a project introduction for '$project'."
    missing_project_docs=1
  fi
done

if [[ "$missing_project_docs" -ne 0 ]]; then
  log "Add the missing project descriptions to the root README before syncing."
  exit 1
fi

log "Fetching $REMOTE/$branch."
git fetch --quiet "$REMOTE" "$branch"

if git show-ref --verify --quiet "refs/remotes/$REMOTE/$branch" &&
  ! git merge-base --is-ancestor "$REMOTE/$branch" HEAD; then
  log "Remote branch is ahead or has diverged; resolve it manually before syncing."
  exit 1
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  pending_count="$(git status --porcelain | wc -l | tr -d ' ')"
  log "Dry run passed. Pending paths: $pending_count; branch: $branch."
  exit 0
fi

git add -A

skipped_count=0
while IFS= read -r -d '' path; do
  case "$path" in
    *.env|*.env.*|*.pem|*.key|*.p12|*.pfx|*/.env|*/.env.*|*/.ssh/*|credentials.json|*/credentials.json|secrets.json|*/secrets.json)
      git restore --staged -- "$path" 2>/dev/null || git reset -q HEAD -- "$path"
      log "Skipped sensitive-looking path: $path"
      skipped_count=$((skipped_count + 1))
      continue
      ;;
  esac

  if [[ -f "$path" ]]; then
    size="$(stat -f '%z' "$path")"
    if [[ "$size" -gt "$MAX_FILE_BYTES" ]]; then
      git restore --staged -- "$path" 2>/dev/null || git reset -q HEAD -- "$path"
      log "Skipped file larger than $MAX_FILE_BYTES bytes: $path"
      skipped_count=$((skipped_count + 1))
    fi
  fi
done < <(git diff --cached --name-only -z)

if git diff --cached --no-ext-diff --text |
  grep -E -- '-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}' >/dev/null; then
  log "Potential credential content detected in staged changes; refusing to commit."
  git reset --quiet
  exit 1
fi

if ! git diff --cached --quiet; then
  commit_message="chore(auto-sync): checkpoint $(date '+%Y-%m-%d %H:%M')"
  git commit -m "$commit_message"
  log "Created commit: $commit_message"
else
  log "No committable changes found."
fi

if git merge-base --is-ancestor "$REMOTE/$branch" HEAD &&
  [[ "$(git rev-list --count "$REMOTE/$branch..HEAD")" -gt 0 ]]; then
  git push "$REMOTE" "$branch"
  log "Pushed local commits to $REMOTE/$branch."
else
  log "Nothing to push."
fi

if [[ "$skipped_count" -gt 0 ]]; then
  log "Skipped $skipped_count protected or oversized path(s); they remain local."
fi
