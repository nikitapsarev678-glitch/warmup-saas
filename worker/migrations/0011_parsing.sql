ALTER TABLE leads ADD COLUMN source_ref_type TEXT;
ALTER TABLE leads ADD COLUMN source_ref_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_source_ref
  ON leads(user_id, source_ref_type, source_ref_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS parsing_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  query_text TEXT NOT NULL,
  geo TEXT,
  limit_count INTEGER NOT NULL DEFAULT 25,
  classify_with_ai INTEGER NOT NULL DEFAULT 0,
  progress_json TEXT NOT NULL DEFAULT '{"groups_found":0,"groups_processed":0,"admins_found":0,"participants_found":0,"leads_added":0,"leads_skipped":0,"tokens_spent":0}',
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (status IN ('queued', 'running', 'paused', 'completed', 'error')),
  CHECK (limit_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_parsing_jobs_user_created
  ON parsing_jobs(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_parsing_jobs_user_status
  ON parsing_jobs(user_id, status, created_at DESC, id DESC);
