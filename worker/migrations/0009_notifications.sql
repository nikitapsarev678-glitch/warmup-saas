CREATE TABLE IF NOT EXISTS user_notification_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  tokens_zero_enabled INTEGER NOT NULL DEFAULT 1,
  account_spam_block_enabled INTEGER NOT NULL DEFAULT 1,
  account_banned_enabled INTEGER NOT NULL DEFAULT 1,
  batch_check_complete_enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES saas_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT,
  sent_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES saas_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_events_user_id_created_at
  ON notification_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_events_user_id_event_type
  ON notification_events(user_id, event_type, created_at DESC);