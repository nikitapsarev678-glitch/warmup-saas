# Фаза 15 — Account Import (TData / Session ZIP как в Contez)

> Читай SPEC.md перед началом. Фазы 1, 2, 4, 12 должны быть выполнены (database, auth, accounts, proxies).  
> Эта фаза добавляет импорт аккаунтов “как в Contez”: загрузка архива (TData / Session+JSON) → обработка runner → создание `tg_accounts` в D1.  
> Работает во всех трёх слоях: `web/`, `worker/`, `runner/`.

## Цель
1) Пользователь выбирает проект (опционально) и формат импорта.  
2) Загружает архив (zip/rar — на MVP можно только zip).  
3) Система создаёт import-job, кладёт архив в R2, ставит задачу в `task_queue`.  
4) Runner скачивает архив, извлекает данные, авторизует аккаунты (где возможно), сохраняет `session_string` и мета-поля в `tg_accounts`.

**MVP‑требование:** `TData` импорт обязателен (это ключевой UX как в Contez). “Пропустить” нельзя.

---

## Файл: worker/migrations/0007_account_import.sql

```sql
-- Джобы импорта аккаунтов
CREATE TABLE IF NOT EXISTS account_import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
    -- 'tdata_zip' | 'session_json_zip' | 'string_session_txt'
  r2_key TEXT,
    -- путь до загруженного архива в R2 (если есть)
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'uploaded' | 'queued' | 'running' | 'action_required' | 'done' | 'error'
  stats_json TEXT,
    -- {"found":10,"imported":8,"errors":2}
  action_json TEXT,
    -- если нужен ввод пользователя: {"type":"2fa","hint":"..."} или {"type":"code","phone":"+..."}
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_aij_user ON account_import_jobs(user_id, created_at DESC);
```

---

## Worker API: рекомендуемый 2‑шаговый upload (чтобы поддержать 100MB как в Contez)

Cloudflare Workers могут иметь ограничения по размеру request-body. Поэтому делаем upload в R2 через signed URL.

### 1) POST /accounts/import/init
Создаёт `account_import_jobs`, отдаёт `upload_url` (signed PUT) и `job_id`.

### 2) POST /accounts/import/:id/commit
Помечает job как `queued`, создаёт запись в `task_queue` (action=`import_accounts`) и триггерит GitHub Actions runner.

### 3) GET /accounts/import/:id
Возвращает статус и `stats_json`.

> Для MVP: используем signed URL в R2 (поддержка больших архивов). Server-upload допустим только для локальной отладки.

---

## Файл: worker/src/routes/accounts-import.ts (новый файл)

Содержит:
- `POST /accounts/import/init`
- `POST /accounts/import/:id/commit`
- `GET /accounts/import/:id`

Важно:
- валидировать `source_type`
- не раскрывать `r2_key` посторонним пользователям (везде `WHERE user_id = ?`)

Подключить в `worker/src/index.ts` (аддитивно):

```ts
import accountImportRoutes from './routes/accounts-import'
app.route('/accounts/import', accountImportRoutes)
```

---

## Web: Import modal

## Файл: web/app/(dashboard)/accounts/import-dialog.tsx (новый файл)

UI как в Contez:
- Project dropdown (optional)
- Формат: Авто / TData / Session+JSON / StringSession
- Toggle “ИИ автозаполнение профиля” (опционально; на MVP можно спрятать)
- Drag&drop + file picker (на MVP: zip)
- Прогресс загрузки
- Экран результата: сколько найдено / импортировано / ошибки

Интеграция: кнопка “Импорт аккаунтов” рядом с “+ Добавить аккаунт”.

---

## Runner: обработка импорта

## Файл: runner/import_accounts.py (новый файл)

Алгоритм (MVP):
1. Получить `job_id` из input.
2. Прочитать job из D1 (user_id, source_type, r2_key).
3. Скачать архив из R2 (через Worker endpoint или прямой R2 signed GET).
4. Для каждого аккаунта извлечь данные и получить StringSession:
   - **TData: поддержать обязательно.** Если аккаунт не “готов” (нужен код/2FA), job переводится в `action_required` и пользователь получает инструкцию.
   - Session+JSON: поддержать (если внутри уже есть session_string).
   - StringSession: поддержать bulk по строкам.
5. Создать `tg_accounts` (с учётом `accounts_limit` тарифа).
6. Записать `stats_json` и статус job.

### UX для `action_required`
Если runner обнаружил, что нужен ввод:
- ставит `account_import_jobs.status='action_required'`
- пишет `action_json` (тип: `code` / `2fa` / `password`)
- UI показывает пользователю “что сделать” и кнопку “Продолжить” (commit/retry)
- (опционально) отправить TG‑уведомление (фаза 17)

Очередь:
- `task_queue.action = 'import_accounts'`
- `params_json = {\"job_id\": N}`

---

## Acceptance criteria

- [ ] Таблица `account_import_jobs` создана
- [ ] UI “Импорт аккаунтов” доступен из `/accounts`
- [ ] Init → отдаёт `job_id` + `upload_url`
- [ ] Commit → ставит задачу в `task_queue` и триггерит runner
- [ ] Runner обновляет `account_import_jobs.stats_json` и status
- [ ] Ошибки отображаются пользователю, а не теряются в логах
