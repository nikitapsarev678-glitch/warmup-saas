#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/web"

cd "$WEB_DIR"

export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096"
export NEXT_TELEMETRY_DISABLED=1

echo "Starting web in low-risk mode from $WEB_DIR"
echo "Mode: webpack dev server"
echo "Node memory cap: 4096 MB"

exec npm run dev -- --hostname 127.0.0.1
