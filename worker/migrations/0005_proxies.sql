CREATE TABLE IF NOT EXISTS proxies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'socks5',
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at TEXT,
  latency_ms INTEGER,
  accounts_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proxies_user ON proxies(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_proxies_unique ON proxies(user_id, host, port);

ALTER TABLE tg_accounts ADD COLUMN proxy_id INTEGER REFERENCES proxies(id) ON DELETE SET NULL;
