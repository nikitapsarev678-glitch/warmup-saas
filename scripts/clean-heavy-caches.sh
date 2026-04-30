#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Cleaning heavy local caches in $ROOT_DIR"

rm -rf "$ROOT_DIR/web/.next"
rm -rf "$ROOT_DIR/worker/.wrangler"
find "$ROOT_DIR" -type d -name "__pycache__" -prune -exec rm -rf {} +
find "$ROOT_DIR" -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete

echo "Done."
