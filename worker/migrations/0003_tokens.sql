CREATE TABLE IF NOT EXISTS token_balance (
  user_id INTEGER PRIMARY KEY REFERENCES saas_users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 400,
  lifetime_earned INTEGER NOT NULL DEFAULT 400,
  lifetime_spent INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS token_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_id TEXT,
  balance_after INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tt_user ON token_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS token_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tokens INTEGER NOT NULL,
  price_rub INTEGER NOT NULL,
  label TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_packages_tokens ON token_packages(tokens);

INSERT INTO token_packages (tokens, price_rub, label)
VALUES
  (50000, 500, '50K'),
  (100000, 1000, '100K'),
  (300000, 3000, '300K'),
  (500000, 5000, '500K'),
  (1000000, 10000, '1M')
ON CONFLICT(tokens) DO UPDATE SET
  price_rub = excluded.price_rub,
  label = excluded.label,
  is_active = 1;
