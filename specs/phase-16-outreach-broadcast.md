# Фаза 16 — Outreach / Рассылки (MVP как nail-parser)

> Читай SPEC.md перед началом. Фазы 1, 2, 4, 11 должны быть выполнены (database, auth, accounts, account detail).  
> Эта фаза добавляет продуктовую “рассылку” (DM + опционально группы/каналы), лимиты, follow‑up (день 3/7), логи и прогресс.  
> Работает в `worker/`, `web/`, `runner/` (аддитивно).

## Цель
Сделать MVP‑рассылок по логике `nail-parser`:
- список получателей: ручной импорт + (позже) AI‑парсинг (см. фазу 20)
- шаблоны сообщений (несколько вариантов)
- отправка по расписанию, лимиты, паузы, auto‑switch аккаунтов
- follow‑up на день 3 и день 7 не ответившим

---

## D1: минимальные сущности

Рекомендация (минимум для MVP):
- `leads` (получатели)
- `broadcasts` (кампания рассылки)
- `broadcast_messages` (факты отправки, статусы, ошибки)
- `followups` (очередь follow‑up)

Эта фаза должна добавить отдельную миграцию `worker/migrations/0008_outreach.sql`.

Обязательные технические требования:
- Идемпотентность отправок: UNIQUE на `(broadcast_id, lead_id, step)` (чтобы не было дублей при retry).
- Логи действий: `broadcast_messages` хранит статус, ошибку, время, account_id.

---

## Worker API (контракт)

- `GET /leads` / `POST /leads/import` (ручной импорт списка)
- `GET /broadcasts` / `POST /broadcasts` / `PUT /broadcasts/:id`
- `POST /broadcasts/:id/start` / `POST /broadcasts/:id/stop`
- `GET /broadcasts/:id/progress`
- `GET /broadcasts/:id/logs`

Важно:
- multi-tenant: всегда `WHERE user_id = ?`
- лимиты и проверки (в т.ч. аккаунт paused/spam_blocked) — на Worker, не на фронте
- поддержать режим targets: `dm` и `groups_or_channels` (включается настройкой пользователя/рассылки)

---

## Runner actions

Добавить действия в очередь (аналогично warmup):
- `send_broadcast` — отправка порции сообщений
- `send_followups` — догон по правилам (день 3/7)
- `check_inbox` — проверка ответов (если нужно для стопа follow-up)

---

## Web UI

Добавить раздел “Рассылки” в дашборд (можно под `/broadcasts`):
- список рассылок + создание
- просмотр прогресса/логов
- простая форма импорта лидов

---

## Acceptance criteria

- [ ] Можно импортировать получателей (минимум: список usernames/ids)
- [ ] Можно создать рассылку, выбрать аккаунты-отправители, задать лимиты
- [ ] Start запускает runner, прогресс виден в UI
- [ ] Follow-up работает (день 3/7) и не дублирует отправки
- [ ] Ошибки (PeerFlood/ban) переводят аккаунт в pause/spam_block и переключают отправку
