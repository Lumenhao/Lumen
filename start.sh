#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"

echo
echo "  Lumen - launcher"
echo "  ---------------"

PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 &&
    "$candidate" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' >/dev/null 2>&1; then
    PY="$candidate"
    break
  fi
done

if [ -z "$PY" ]; then
  echo "  Python 3.11+ was not found. Install it and try again."
  exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "  Creating .venv ..."
  "$PY" -m venv .venv || {
    echo "  Could not create a virtual environment (on Debian/Ubuntu: apt install python3-venv)."
    exit 1
  }
fi

echo "  Checking dependencies ..."
.venv/bin/python -m pip install --quiet --disable-pip-version-check -r app/requirements.txt || {
  echo "  Dependency install failed - see the messages above."
  exit 1
}

PORT=$(.venv/bin/python -c "from app.config import settings; print(settings.port)")
URL="http://127.0.0.1:${PORT}"
echo "  Opening ${URL}"

(
  sleep 2
  if command -v open >/dev/null 2>&1; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1
  fi
) &

exec .venv/bin/python -m app.main
