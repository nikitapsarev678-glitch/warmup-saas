PRAGMA foreign_keys=off;

CREATE TABLE task_queue_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  params_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT
);

INSERT INTO task_queue_new (
  id,
  campaign_id,
  action,
  params_json,
  status,
  progress_json,
  error,
  created_at,
  started_at,
  completed_at
)
SELECT
  id,
  NULLIF(campaign_id, 0),
  action,
  params_json,
  status,
  progress_json,
  error,
  created_at,
  started_at,
  completed_at
FROM task_queue;

DROP TABLE task_queue;
ALTER TABLE task_queue_new RENAME TO task_queue;

CREATE INDEX IF NOT EXISTS idx_tq_status ON task_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tq_campaign ON task_queue(campaign_id);

PRAGMA foreign_keys=on;
