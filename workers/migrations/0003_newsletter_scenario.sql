-- メールマガジン
CREATE TABLE IF NOT EXISTS newsletters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  slug            TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'active',
  from_sender_id  INTEGER REFERENCES sender_settings(id) ON DELETE SET NULL,
  reply_to        TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 購読管理
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  newsletter_id   INTEGER NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  subscriber_id   INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active',
  opted_in_at     TEXT NOT NULL DEFAULT (datetime('now')),
  opted_out_at    TEXT,
  UNIQUE(newsletter_id, subscriber_id)
);

-- シナリオフロー
CREATE TABLE IF NOT EXISTS scenario_flows (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  trigger_type    TEXT NOT NULL DEFAULT 'on_subscribe',
  newsletter_id   INTEGER REFERENCES newsletters(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- シナリオステップ (email / condition / wait)
CREATE TABLE IF NOT EXISTS scenario_steps (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id             INTEGER NOT NULL REFERENCES scenario_flows(id) ON DELETE CASCADE,
  step_order          INTEGER NOT NULL DEFAULT 0,
  step_type           TEXT NOT NULL DEFAULT 'email',
  delay_hours         INTEGER NOT NULL DEFAULT 0,
  subject             TEXT NOT NULL DEFAULT '',
  body_html           TEXT NOT NULL DEFAULT '',
  body_text           TEXT NOT NULL DEFAULT '',
  condition_type      TEXT NOT NULL DEFAULT '',
  condition_step_order INTEGER,
  yes_next_order      INTEGER,
  no_next_order       INTEGER,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ワークフロー実行インスタンス
CREATE TABLE IF NOT EXISTS workflow_instances (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id             INTEGER NOT NULL REFERENCES scenario_flows(id) ON DELETE CASCADE,
  subscriber_id       INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  current_step_order  INTEGER,
  status              TEXT NOT NULL DEFAULT 'active',
  next_run_at         TEXT,
  started_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ワークフローステップログ
CREATE TABLE IF NOT EXISTS workflow_step_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  instance_id     INTEGER NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  sent_at         TEXT NOT NULL DEFAULT (datetime('now')),
  result          TEXT NOT NULL DEFAULT 'sent'
);
