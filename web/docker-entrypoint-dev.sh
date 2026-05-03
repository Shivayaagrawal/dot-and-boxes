#!/bin/sh
set -e
cd /app

stamp="/app/.docker-npm-stamp"
sum=""
if [ -f package-lock.json ]; then
  sum=$(sha256sum package-lock.json | cut -d' ' -f1)
else
  echo "docker-entrypoint-dev: missing package-lock.json" >&2
  exit 1
fi

if [ ! -f "$stamp" ] || [ "$(cat "$stamp" 2>/dev/null)" != "$sum" ]; then
  echo "docker-entrypoint-dev: npm ci (lockfile changed or fresh volume)"
  npm ci
  echo "$sum" >"$stamp"
fi

exec "$@"
