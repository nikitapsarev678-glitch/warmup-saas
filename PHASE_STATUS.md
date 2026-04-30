# Varmup — Phase Status

Источник истины по прогрессу разработки. Нужен, чтобы AI не «угадывал» фазу по файловой структуре.

Правила:
- Обновляй этот файл и `PHASE_STATUS.json` после завершения **каждой** фазы.
- Фаза = `done` только когда выполнены acceptance criteria из `specs/phase-XX-*.md`.

## Статусы
- `todo` — не начинали
- `in_progress` — в работе
- `done` — полностью завершена
- `blocked` — заблокирована (нужны ключи/доступ/решение)

## Таблица фаз

| Фаза | Статус | Комментарий |
|---:|:---:|---|
| 00 | done | scaffold (worker/web/runner skeleton на месте) |
| 01 | done | database (0001_init.sql + db.ts) |
| 02 | done | auth (routes/auth + requireAuth + login UI) |
| 03 | done | billing (routes/billing + billing UI) |
| 04 | done | accounts verified end-to-end after reconnecting `/accounts` route in worker index |
| 05 | done | warmup runner (D1 client + Telethon warmup engine + poll workflow) |
| 06 | done | dashboard UI verified after fixing authenticated server fetches and campaign pages |
| 07 | done | analytics completed with worker endpoints and dashboard charts |
| 08 | done | landing completed with public marketing homepage and scrollytelling sections |
| 09 | done | AI dialogs completed with OpenRouter-backed runner support, campaign ai_* fields, and AI warmup controls in campaign creation |

Текущая фаза: 21.
| 10 | done | tokens system completed with worker routes, billing webhook integration, campaign spend checks, and billing UI |
| 11 | done | account detail panel completed with tenant-safe detail routes, profile save, pause/SpamBot/autowarmup controls, and account sheet UI |
| 12 | done | proxy manager completed with migration, tenant-safe worker routes, and dashboard UI |
| 13 | done | deploy/infrastructure completed; Robokassa webhook and end-to-end payment verification deferred until merchant onboarding is possible after public launch |
| 14 | done | projects completed with tenant-safe worker CRUD, D1 migration, dashboard page, and project selectors in accounts/campaign creation |
| 15 | done | account import completed with D1 import jobs, tenant-safe worker routes, R2-backed upload, dashboard import dialog, and runner processing for TData/session archives |
| 16 | done | outreach/broadcast completed with D1 migration, tenant-safe leads/broadcast routes, runner follow-up processing, and dashboard pages for /leads and /broadcasts |
| 17 | done | automation + notifications completed with notification settings/events migration, tenant-safe worker API, scheduled batch-check, zero-balance task pause notifications, and dashboard settings UI |
| 18 | done | token metering completed with D1 usage ledger, idempotent per-action charging in runner warmup/broadcast flows, zero-balance auto-pause, and removal of upfront AI campaign charge |
| 19 | done | proxy checker completed with tenant-safe /proxies/check queueing, runner validation that updates active/dead status + latency in D1, and dashboard trigger/status display |
| 20 | done | AI parsing completed with tenant-safe worker parsing jobs API, runner lead extraction + D1 persistence, idempotent per-lead token metering, and /leads UI progress polling |
| 21 | done | quality & launch completed with cooldown/rate-limit hardening, tenant-safe runner error visibility, explainable dashboard states, queue timeout/chunking fixes, and runtime canary flags for parsing/AI/groups without deploy |
