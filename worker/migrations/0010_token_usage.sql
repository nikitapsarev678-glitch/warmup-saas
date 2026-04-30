CREATE TABLE IF NOT EXISTS token_usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  tokens_spent INTEGER NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (units > 0),
  CHECK (tokens_spent >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_idempotency ON token_usage_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_created ON token_usage_events(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_ref ON token_usage_events(ref_type, ref_id, created_at DESC, id DESC);
