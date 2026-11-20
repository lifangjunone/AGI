---
name: safe-commit-gate
description: Stage, scan, test and commit workspace changes with large-file, secret and test gates. Use when asked to commit or push. Do not use for editing code or deploying services.
---

# Safe Commit Gate

Reusable commit workflow for this multi-product monorepo. Run the gates in order;
do not skip a gate to save time. Never use `git add -A` or `git add .`.

## 1. Inspect before staging

1. `git status --short --branch` and `git log -6 --oneline` to learn the scope and commit style.
2. `git diff --stat` plus `git diff` for tracked edits; list untracked directories.
3. Group changes by product directory so the commit message and test selection match the real scope.

## 2. Exclude non-source and oversized material first

1. Find nested repositories: `find <new dirs> -name .git -type d -prune -print`.
   Never commit a nested `.git` as a gitlink by accident; either ignore the clone or keep only
   integration docs/lockfiles.
2. Measure new directories with `du -sh` and list files over 10 MB. Stage blobs must stay under
   10 MB; exclude large binaries, model weights, build caches, PDFs and `node_modules`.
3. Confirm there are no real `.env` files (only `.env.example` is allowed).
4. When a path is intentionally excluded, add it to `.gitignore` and leave it untracked. Report
   the excluded path in the final summary; do not silently drop it.

## 3. Stage by explicit paths

Stage only the reviewed product, deployment, documentation and artifact paths. Keep the oversized
or machine-generated file unstaged. Re-run `git status` to confirm the staged set.

## 4. Run the deterministic gate

Execute `scripts/precommit-gate.sh` from the repo root. It checks staged blobs over 10 MB,
high-confidence secrets, hardcoded credential assignments, and whitespace errors.

- A high-confidence match (private key, cloud key, GitHub/Slack token) blocks the commit.
- `process.env` / `env.` / `os.environ` reads and obvious test fixtures are not secrets.
- Fix reported trailing whitespace or EOF blank lines, re-stage, and re-run until clean.

## 5. Test the affected products only

Pick each project's available entry point; do not assume one runner.

- Node: inspect `package.json` scripts, run `npm test` when present, otherwise a lint or build.
- Python with a venv: use the project venv `pytest`. The system `python3` often lacks pytest;
  for pytest-style function files without a venv, run the file directly when it has a
  `__main__` entry, or use `python3 -m unittest discover -s tests`.
- Prefer a project's curated `verify` script over a known-flaky full suite, and state which
  historical failures are unrelated to the current change.

## 6. Commit and verify locally

1. Write a concise conventional message matching repo style (`feat:`, `fix:`), summarizing the
   product scope rather than naming every file.
2. After committing, confirm `git log -1`, `git status --short`, and
   `git rev-list --left-right --count origin/main...HEAD`.
3. State exactly which tests passed, which files were excluded, and the new commit hash.

## 7. Push only when requested

1. Run `git push origin main` only after the user asks to push.
2. Do not report success from the push command alone. Independently verify with
   `git ls-remote origin refs/heads/main` and confirm the remote hash equals local `HEAD` and
   the ahead/behind count is `0 0`. A timeout or interrupted push means the state is unconfirmed
   and must be re-checked, never assumed complete.

## Repository-specific facts

- Shared Nginx config and production topology docs live under `deployments/`; never record
  passwords, tokens, API keys, private keys, cookies or production file contents there.
- `doc-fetch-resources/agentsphere-0415-source.pdf` is a known ~47 MB file that must stay
  untracked; do not force-add it.
- This monorepo mixes Node, Python and Electron products, so always select tests per product
  instead of running one root-level command.
