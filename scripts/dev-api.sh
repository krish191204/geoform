#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi
exec vendor/worldengine/.venv/bin/python server/worldengine_api.py
