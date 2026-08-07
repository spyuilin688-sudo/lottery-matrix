#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v timeout >/dev/null || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

vite="${SITES_PROJECT_ROOT}/node_modules/.bin/vite"
tsc="${SITES_PROJECT_ROOT}/node_modules/.bin/tsc"
if [[ ! -x "${vite}" || ! -x "${tsc}" ]]; then
  echo "Vite or TypeScript is unavailable. Run npm run install:ci before building." >&2
  exit 69
fi

echo "Running bounded verified Vite build..."
timeout \
  --signal=TERM \
  --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
  "${SITES_BUILD_TIMEOUT:-3m}" \
  npm run build

"${script_dir}/validate-artifact.sh"
