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
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
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
