CREATE TABLE IF NOT EXISTS feature_flags (
  user_id INTEGER PRIMARY KEY REFERENCES saas_users(id) ON DELETE CASCADE,
  ai_parsing_enabled INTEGER NOT NULL DEFAULT 1,
  ai_dialogs_enabled INTEGER NOT NULL DEFAULT 1,
  group_broadcasts_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ai_parsing_enabled IN (0, 1)),
  CHECK (ai_dialogs_enabled IN (0, 1)),
  CHECK (group_broadcasts_enabled IN (0, 1))
);
