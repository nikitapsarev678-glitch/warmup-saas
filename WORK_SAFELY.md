# Work Safely

This repository previously had a few local-state issues that could make VS Code and AI agents consume excessive memory:

- `web` was stored as a nested Git repository inside the main repository
- generated folders such as `node_modules`, `.next`, `.wrangler`, and `__pycache__` were being tracked or scanned too aggressively
- Next.js 16 uses Turbopack by default, which can be memory-hungry on some machines

## Safe workflow

1. Open the repository again after these changes so workspace settings are reloaded.
2. Prefer opening only the frontend folder if you are working on UI:

```bash
cd /Users/nikitapsarev/Documents/ai/warmup-saas/web
```

3. Start the frontend with the safe wrapper:

```bash
/Users/nikitapsarev/Documents/ai/warmup-saas/scripts/safe-web-dev.sh
```

4. If the project ever feels heavy again, clean local caches:

```bash
/Users/nikitapsarev/Documents/ai/warmup-saas/scripts/clean-heavy-caches.sh
```

## Notes

- `web/.git` was moved to `.repo-backups/web-dot-git-backup-2026-04-28` as a safety backup.
- The main Git repository now tracks real files inside `web/` instead of a broken gitlink.
- `web/package.json` defaults to `next dev --webpack` for safer local startup.
