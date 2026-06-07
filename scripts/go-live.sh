#!/usr/bin/env bash
# go-live.sh — run Caribe and expose it on a public HTTPS URL via a Cloudflare quick
# tunnel (no account, no DNS). The link is live while this script runs on your machine.
# For permanent 24/7 hosting, use the Docker deploy in DEPLOY.md instead.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8080}"
command -v cloudflared >/dev/null || { echo "cloudflared not found. Install: brew install cloudflared"; exit 1; }

echo "Starting Caribe on :$PORT …"
node --no-warnings server/server.js >/tmp/caribe-live.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 2

echo "Opening public HTTPS tunnel (share the https://*.trycloudflare.com link below) …"
echo "Press Ctrl+C to stop."
cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate
