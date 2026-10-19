#!/bin/sh
# Run as the site's foreground process, with secrets supplied by the host.
set -eu
cd "$(dirname "$0")/../.."
: "${IP:?The site-assigned IP is required}"
: "${PORT:?The site-assigned PORT is required}"
if [ "${NODE_ENV:-}" != production ]; then
  echo 'This launcher requires NODE_ENV=production' >&2
  exit 1
fi
export BIND_HOST="$IP"
exec node dist/apps/api/src/server.js
