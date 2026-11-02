#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
upstream_dir="${project_dir}/open-source/mycontext"
expected_commit="23c6f609fb1d392f922e19dae7bee174075a2569"

if [[ ! -d "${upstream_dir}/.git" ]]; then
  echo "MyContext is not checked out at ${upstream_dir}."
  echo "Run: git clone https://github.com/openTrinity/mycontext.git ${upstream_dir}"
  exit 1
fi

actual_commit="$(git -C "${upstream_dir}" rev-parse HEAD)"
if [[ "${actual_commit}" != "${expected_commit}" ]]; then
  echo "Refusing to run an unreviewed MyContext revision."
  echo "Expected: ${expected_commit}"
  echo "Actual:   ${actual_commit}"
  exit 1
fi

for node22_dir in \
  "/Users/bytedance/Desktop/projects/.tools/homebrew/opt/node@22/bin" \
  "/opt/homebrew/opt/node@22/bin" \
  "/usr/local/opt/node@22/bin"; do
  if [[ -x "${node22_dir}/node" ]]; then
    export PATH="${node22_dir}:${PATH}"
    break
  fi
done

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${node_major}" != "22" ]]; then
  echo "MyContext requires Node 22.17.x–22.x; current Node is $(node -v)."
  echo "Use a Node version manager to select Node 22, then run this script again."
  exit 1
fi

if command -v corepack >/dev/null 2>&1; then
  corepack pnpm@10.13.1 --version >/dev/null
  pnpm_cmd=(corepack pnpm@10.13.1)
elif command -v pnpm >/dev/null 2>&1; then
  pnpm_cmd=(pnpm)
else
  echo "pnpm is required. Enable Corepack or install pnpm 10.13.1."
  exit 1
fi

cd "${upstream_dir}"
if [[ ! -d node_modules ]]; then
  "${pnpm_cmd[@]}" install --frozen-lockfile
fi

exec "${pnpm_cmd[@]}" dev
