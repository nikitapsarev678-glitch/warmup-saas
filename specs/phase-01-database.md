# Фаза 1 — Database Schema

> Читай SPEC.md перед началом. Твоя задача: создать SQL-схему D1 и TypeScript хелперы для работы с БД.

## Цель
Создать `worker/migrations/0001_init.sql` и `worker/src/db.ts` с типизированными хелперами. Никакой бизнес-логики роутов.

## Зависимости
- Фаза 0 (scaffold) должна быть выполнена: файл `worker/src/index.ts` существует.

## Не трогай
- `worker/src/index.ts` — не добавляй роуты
- `worker/src/routes/` — эти файлы создают другие фазы

---

## Файл: worker/migrations/0001_init.sql

```sql
-- Varmup — D1 Schema
-- Применить: wrangler d1 execute warmup-saas --remote --file=migrations/0001_init.sql

-- ── Пользователи (SaaS-клиенты) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS saas_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  telegram_username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
    -- 'free' | 'starter' | 'basic' | 'pro' | 'agency'
  plan_expires_at TEXT,
    -- NULL = бессрочно (для free) или дата истечения
  accounts_limit INTEGER NOT NULL DEFAULT 1,
    -- лимит аккаунтов по тарифу
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Telegram аккаунты пользователя (для прогрева) ─────────────────
CREATE TABLE IF NOT EXISTS tg_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  session_string TEXT,
    -- Telethon StringSession (зашифрованный)
  api_id INTEGER,
  api_hash TEXT,
  first_name TEXT,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending'      = добавлен, session не получена
    -- 'active'       = готов к прогреву
    -- 'warming'      = прогрев идёт
    -- 'warmed'       = прогрев завершён
    -- 'spam_block'   = получил spam_block (временный)
    -- 'banned'       = забанен (постоянный)
    -- 'disabled'     = отключён пользователем
  proxy TEXT,
    -- JSON: {"type":"socks5","host":"...","port":1080,"user":"...","pass":"..."}
  block_reason TEXT,
  blocked_at TEXT,
  warmed_at TEXT,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tg_accounts_user ON tg_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_tg_accounts_status ON tg_accounts(status);

-- ── Кампании прогрева ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
    -- 'idle' | 'running' | 'paused' | 'completed' | 'error'

  -- Настройки прогрева
  warmup_days INTEGER NOT NULL DEFAULT 14,
    -- сколько дней прогревать
  daily_actions_min INTEGER NOT NULL DEFAULT 5,
    -- минимум действий в день на аккаунт
  daily_actions_max INTEGER NOT NULL DEFAULT 15,
  delay_between_actions_min INTEGER NOT NULL DEFAULT 60,
    -- задержка между действиями (секунды)
  delay_between_actions_max INTEGER NOT NULL DEFAULT 300,
  work_hour_start INTEGER NOT NULL DEFAULT 9,
    -- рабочие часы (московское время)
  work_hour_end INTEGER NOT NULL DEFAULT 22,

  -- Включённые действия (битовые флаги через JSON)
  actions_config TEXT NOT NULL DEFAULT '{"join_groups":true,"read_messages":true,"reactions":true,"dialogs":true,"story_views":true,"profile_setup":true}',

  -- Прогрев через диалоги между своими аккаунтами
  use_pool_dialogs INTEGER NOT NULL DEFAULT 1,
    -- 1 = аккаунты пишут друг другу, 0 = только внешние действия

  -- Группы для вступления (JSON-массив ссылок)
  target_groups TEXT NOT NULL DEFAULT '[]',

  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- ── Привязка аккаунтов к кампании ────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_accounts (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES tg_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'running' | 'done' | 'error'
  actions_done INTEGER NOT NULL DEFAULT 0,
  days_done INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  PRIMARY KEY (campaign_id, account_id)
);

-- ── Лог действий прогрева ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warmup_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES tg_accounts(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
    -- 'join_group' | 'read_messages' | 'reaction' | 'dialog_sent' |
    -- 'dialog_received' | 'story_view' | 'profile_updated'
  target TEXT,
    -- username группы, peer_id собеседника и т.д.
  status TEXT NOT NULL DEFAULT 'ok',
    -- 'ok' | 'error' | 'skipped'
  error_text TEXT,
  executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wa_campaign ON warmup_actions(campaign_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_wa_account ON warmup_actions(account_id, executed_at);

-- ── Очередь задач (Worker → Runner) ──────────────────────────────
CREATE TABLE IF NOT EXISTS task_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
    -- 'run_warmup_day' | 'setup_profile'
  params_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
    -- 'queued' | 'running' | 'done' | 'error'
  progress_json TEXT,
    -- {"current_account": 2, "total_accounts": 5, "actions_done": 12}
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tq_status ON task_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tq_campaign ON task_queue(campaign_id);

-- ── Платежи ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  robokassa_invoice_id TEXT UNIQUE,
  plan TEXT NOT NULL,
    -- тариф который покупают
  amount INTEGER NOT NULL,
    -- сумма в рублях
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'paid' | 'failed' | 'refunded'
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);

-- ── Группы для прогрева (общий пул) ──────────────────────────────
CREATE TABLE IF NOT EXISTS warmup_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  title TEXT,
  members_count INTEGER,
  category TEXT,
    -- 'news' | 'chat' | 'tech' | 'lifestyle' | 'business' | 'other'
  is_active INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Пул групп по умолчанию для прогрева ──────────────────────────
INSERT OR IGNORE INTO warmup_groups (username, title, category) VALUES
  ('telegram', 'Telegram News', 'news'),
  ('durov', 'Pavel Durov', 'news'),
  ('tginfo', 'Telegram Info', 'news');

-- ── Тарифные лимиты (справочник) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_limits (
  plan TEXT PRIMARY KEY,
  accounts_limit INTEGER NOT NULL,
  warmup_days_max INTEGER NOT NULL,
  price_rub INTEGER NOT NULL
);

INSERT OR REPLACE INTO plan_limits VALUES
  ('free',    1,   3,    0),
  ('starter', 5,   14,   790),
  ('basic',   20,  30,   1690),
  ('pro',     100, 60,   2490),
  ('agency',  500, 9999, 4490);
```

---

## Файл: worker/src/db.ts

```typescript
import type { Env } from './index'

export type Plan = 'free' | 'starter' | 'basic' | 'pro' | 'agency'
export type AccountStatus = 'pending' | 'active' | 'warming' | 'warmed' | 'spam_block' | 'banned' | 'disabled'
export type CampaignStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error'
export type TaskStatus = 'queued' | 'running' | 'done' | 'error'

export interface SaasUser {
  id: number
  telegram_id: number
  telegram_username: string | null
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  plan: Plan
  plan_expires_at: string | null
  accounts_limit: number
  created_at: string
}

export interface TgAccount {
  id: number
  user_id: number
  phone: string
  session_string: string | null
  api_id: number | null
  api_hash: string | null
  first_name: string | null
  username: string | null
  status: AccountStatus
  proxy: string | null
  block_reason: string | null
  blocked_at: string | null
  warmed_at: string | null
  messages_sent: number
  created_at: string
}

export interface Campaign {
  id: number
  user_id: number
  name: string
  status: CampaignStatus
  warmup_days: number
  daily_actions_min: number
  daily_actions_max: number
  delay_between_actions_min: number
  delay_between_actions_max: number
  work_hour_start: number
  work_hour_end: number
  actions_config: string
  use_pool_dialogs: number
  target_groups: string
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface PlanLimits {
  plan: Plan
  accounts_limit: number
  warmup_days_max: number
  price_rub: number
}

// ── User helpers ──────────────────────────────────────────────────

export async function getUserByTelegramId(
  db: D1Database,
  telegramId: number
): Promise<SaasUser | null> {
  return db
    .prepare('SELECT * FROM saas_users WHERE telegram_id = ?')
    .bind(telegramId)
    .first<SaasUser>()
}

export async function createUser(
  db: D1Database,
  data: Pick<SaasUser, 'telegram_id' | 'telegram_username' | 'first_name' | 'last_name' | 'photo_url'>
): Promise<SaasUser> {
  await db
    .prepare(`
      INSERT INTO saas_users (telegram_id, telegram_username, first_name, last_name, photo_url)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(data.telegram_id, data.telegram_username, data.first_name, data.last_name, data.photo_url)
    .run()
  return (await getUserByTelegramId(db, data.telegram_id))!
}

export async function upsertUser(
  db: D1Database,
  data: Pick<SaasUser, 'telegram_id' | 'telegram_username' | 'first_name' | 'last_name' | 'photo_url'>
): Promise<SaasUser> {
  await db
    .prepare(`
      INSERT INTO saas_users (telegram_id, telegram_username, first_name, last_name, photo_url)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        telegram_username = excluded.telegram_username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        photo_url = excluded.photo_url,
        updated_at = CURRENT_TIMESTAMP
    `)
    .bind(data.telegram_id, data.telegram_username, data.first_name, data.last_name, data.photo_url)
    .run()
  return (await getUserByTelegramId(db, data.telegram_id))!
}

export async function upgradePlan(
  db: D1Database,
  userId: number,
  plan: Plan,
  expiresAt: string,
  accountsLimit: number
): Promise<void> {
  await db
    .prepare(`
      UPDATE saas_users
      SET plan = ?, plan_expires_at = ?, accounts_limit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .bind(plan, expiresAt, accountsLimit, userId)
    .run()
}

// ── Account helpers ───────────────────────────────────────────────

export async function getAccountsByUser(
  db: D1Database,
  userId: number
): Promise<TgAccount[]> {
  const { results } = await db
    .prepare('SELECT * FROM tg_accounts WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all<TgAccount>()
  return results
}

export async function getAccountById(
  db: D1Database,
  accountId: number,
  userId: number
): Promise<TgAccount | null> {
  return db
    .prepare('SELECT * FROM tg_accounts WHERE id = ? AND user_id = ?')
    .bind(accountId, userId)
    .first<TgAccount>()
}

export async function countUserAccounts(
  db: D1Database,
  userId: number
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as cnt FROM tg_accounts WHERE user_id = ? AND status != 'banned'")
    .bind(userId)
    .first<{ cnt: number }>()
  return row?.cnt ?? 0
}

// ── Campaign helpers ──────────────────────────────────────────────

export async function getCampaignsByUser(
  db: D1Database,
  userId: number
): Promise<Campaign[]> {
  const { results } = await db
    .prepare('SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all<Campaign>()
  return results
}

export async function getCampaignById(
  db: D1Database,
  campaignId: number,
  userId: number
): Promise<Campaign | null> {
  return db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?')
    .bind(campaignId, userId)
    .first<Campaign>()
}

// ── Plan limits helper ────────────────────────────────────────────

export async function getPlanLimits(
  db: D1Database,
  plan: Plan
): Promise<PlanLimits | null> {
  return db
    .prepare('SELECT * FROM plan_limits WHERE plan = ?')
    .bind(plan)
    .first<PlanLimits>()
}
```

---

## Acceptance criteria

- [ ] `wrangler d1 execute warmup-saas --local --file=migrations/0001_init.sql` — выполняется без ошибок
- [ ] `wrangler d1 execute warmup-saas --local --command="SELECT * FROM plan_limits"` — возвращает 5 строк тарифов
- [ ] `npx tsc --noEmit` в worker/ — 0 ошибок типизации в db.ts
- [ ] Все 7 таблиц созданы: saas_users, tg_accounts, campaigns, campaign_accounts, warmup_actions, task_queue, payments, warmup_groups, plan_limits
