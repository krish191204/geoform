#!/usr/bin/env bash
# Clone + venv install for Mindwerks WorldEngine (gitignored under vendor/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WE="$ROOT/vendor/worldengine"
TAG="${WORLENGINE_TAG:-v0.20.0}"

mkdir -p "$ROOT/vendor"
if [[ ! -d "$WE/.git" && ! -f "$WE/pyproject.toml" ]]; then
  echo "Cloning Mindwerks/worldengine @ $TAG …"
  git clone --depth 1 --branch "$TAG" https://github.com/Mindwerks/worldengine.git "$WE" \
    || git clone --depth 1 https://github.com/Mindwerks/worldengine.git "$WE"
fi

if [[ ! -x "$WE/.venv/bin/python" ]]; then
  echo "Creating venv …"
  python3 -m venv "$WE/.venv"
fi

echo "Installing worldengine (editable) …"
"$WE/.venv/bin/pip" install -U pip setuptools wheel
"$WE/.venv/bin/pip" install -e "$WE"

echo "OK — run: npm run dev:api   (then npm run dev in another terminal)"
"$WE/.venv/bin/python" -c "import worldengine; print('worldengine', getattr(worldengine,'__version__', '?'))"
