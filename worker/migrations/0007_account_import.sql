-- Account import jobs
CREATE TABLE IF NOT EXISTS account_import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  stats_json TEXT,
  action_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_aij_user ON account_import_jobs(user_id, created_at DESC);
