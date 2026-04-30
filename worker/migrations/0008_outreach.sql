CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  telegram_id INTEGER,
  username TEXT,
  title TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (telegram_id IS NOT NULL OR username IS NOT NULL),
  CHECK (status IN ('active', 'replied', 'blocked'))
);
CREATE INDEX IF NOT EXISTS idx_leads_user_created ON leads(user_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_user_username ON leads(user_id, username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_user_tg_id ON leads(user_id, telegram_id) WHERE telegram_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  target_mode TEXT NOT NULL DEFAULT 'dm',
  message_variants_json TEXT NOT NULL,
  limits_json TEXT,
  settings_json TEXT,
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('draft', 'queued', 'running', 'paused', 'completed', 'error')),
  CHECK (target_mode IN ('dm', 'groups_or_channels'))
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_user_created ON broadcasts(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS broadcast_accounts (
  broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES tg_accounts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (broadcast_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_broadcast_accounts_account ON broadcast_accounts(account_id, broadcast_id);

CREATE TABLE IF NOT EXISTS broadcast_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES tg_accounts(id) ON DELETE SET NULL,
  step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('queued', 'sent', 'skipped', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_messages_unique_send ON broadcast_messages(broadcast_id, lead_id, step);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast ON broadcast_messages(broadcast_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_broadcast_messages_user ON broadcast_messages(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (step IN (1, 2)),
  CHECK (status IN ('pending', 'queued', 'done', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_followups_unique ON followups(broadcast_id, lead_id, step);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(user_id, status, due_at);
