CREATE TABLE IF NOT EXISTS account_login_states (
  account_id INTEGER PRIMARY KEY REFERENCES tg_accounts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  temp_session_string TEXT,
  phone_code_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  password_required INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (password_required IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_account_login_states_user ON account_login_states(user_id);
CREATE INDEX IF NOT EXISTS idx_account_login_states_status ON account_login_states(status);

CREATE INDEX IF NOT EXISTS idx_account_login_states_user ON account_login_states(user_id);
CREATE INDEX IF NOT EXISTS idx_account_login_states_status ON account_login_states(status);
