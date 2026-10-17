#!/usr/bin/env bash
# Dev bootstrap for the NDLI Club Main Portal (local venv path).
# Creates a virtualenv, installs backend + frontend dependencies, prepares .env
# and runs the initial migrations. Idempotent: safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VENV_DIR="${VENV_DIR:-.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "==> Creating virtualenv at ${VENV_DIR}"
if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip

echo "==> Installing backend dependencies (dev toolchain included)"
pip install -r backend/requirements-dev.txt

echo "==> Preparing .env"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    Created .env from .env.example (dev defaults; edit as needed)."
else
  echo "    .env already exists; leaving it untouched."
fi

echo "==> Installing frontend dependencies"
if command -v npm >/dev/null 2>&1; then
  (cd frontend && npm ci)
else
  echo "    npm not found — skipping frontend install (see README.md)."
fi

echo "==> Applying database migrations (SQLite by default in dev)"
python backend/manage.py migrate --noinput

cat <<'DONE'

Bootstrap complete.

Run the stack:
  make dev        # Django dev server (http://localhost:8000) + Vite (http://localhost:5173)
  make test       # backend smoke tests
  make lint       # ruff + frontend lint

See README.md for the docker-compose path.
DONE
