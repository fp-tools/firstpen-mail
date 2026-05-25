-- =====================================================
--  FirstPen Waitlist Database Schema (Cloudflare D1)
-- =====================================================

-- 登録者テーブル
CREATE TABLE IF NOT EXISTS subscribers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT DEFAULT '',
  role            TEXT DEFAULT '',              -- seller / buyer / both
  interest        TEXT DEFAULT '',              -- writing / image / automation / ...
  source          TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'active', -- active / unsubscribed / bounced
  country         TEXT DEFAULT '',
  ip              TEXT DEFAULT '',
  user_agent      TEXT DEFAULT '',
  sendgrid_contact_id TEXT DEFAULT '',          -- SendGrid Marketing Contacts ID (同期用)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscribers_email   ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_status  ON subscribers(status);
CREATE INDEX IF NOT EXISTS idx_subscribers_role    ON subscribers(role);
CREATE INDEX IF NOT EXISTS idx_subscribers_created ON subscribers(created_at);

-- タグマスター
CREATE TABLE IF NOT EXISTS tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT DEFAULT '#a78bfa',
  description TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 登録者↔タグの中間テーブル
CREATE TABLE IF NOT EXISTS subscriber_tags (
  subscriber_id INTEGER NOT NULL,
  tag_id        INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subscriber_id, tag_id),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)        REFERENCES tags(id)        ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subscriber_tags_tag ON subscriber_tags(tag_id);

-- メールテンプレート
CREATE TABLE IF NOT EXISTS templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body_html   TEXT NOT NULL,
  body_text   TEXT DEFAULT '',
  category    TEXT DEFAULT 'campaign',          -- campaign / thankyou / step / system
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 送信キャンペーン (手動送信ログ)
CREATE TABLE IF NOT EXISTS campaigns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  subject        TEXT NOT NULL,
  body_html      TEXT NOT NULL,
  body_text      TEXT DEFAULT '',
  target_query   TEXT DEFAULT '',               -- JSON: { tags:[], roles:[], status:'active' }
  status         TEXT NOT NULL DEFAULT 'draft', -- draft / sending / sent / failed
  sent_count     INTEGER DEFAULT 0,
  failed_count   INTEGER DEFAULT 0,
  scheduled_at   TEXT DEFAULT NULL,
  sent_at        TEXT DEFAULT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- ステップメール定義 (SendGrid Automation連携)
CREATE TABLE IF NOT EXISTS step_flows (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  name                     TEXT NOT NULL,
  description              TEXT DEFAULT '',
  trigger_type             TEXT NOT NULL DEFAULT 'on_signup', -- on_signup / on_tag_added
  trigger_value            TEXT DEFAULT '',                    -- タグ名など
  status                   TEXT NOT NULL DEFAULT 'active',     -- active / paused
  sendgrid_automation_id   TEXT DEFAULT '',                    -- SendGrid側のID
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ステップメールのステップ
CREATE TABLE IF NOT EXISTS step_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  flow_id         INTEGER NOT NULL,
  step_order      INTEGER NOT NULL,
  delay_hours     INTEGER NOT NULL DEFAULT 24,   -- トリガーからの経過時間
  template_id     INTEGER,
  subject         TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  body_text       TEXT DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (flow_id) REFERENCES step_flows(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_step_messages_flow ON step_messages(flow_id, step_order);

-- 配信イベント (SendGrid Event Webhook からの記録)
CREATE TABLE IF NOT EXISTS email_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id   INTEGER,
  campaign_id     INTEGER,
  email           TEXT NOT NULL,
  event_type      TEXT NOT NULL,                -- delivered / open / click / bounce / dropped / spamreport / unsubscribe
  url             TEXT DEFAULT '',              -- click時のURL
  reason          TEXT DEFAULT '',              -- bounce/drop理由
  message_id      TEXT DEFAULT '',              -- SendGrid Message ID
  event_ts        TEXT NOT NULL,                -- イベント発生時刻
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id)   REFERENCES campaigns(id)   ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_events_subscriber ON email_events(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_events_campaign   ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_events_type       ON email_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_ts         ON email_events(event_ts);

-- 初期データ: デフォルトタグ
INSERT OR IGNORE INTO tags (name, color, description) VALUES
  ('出品者', '#7c3aed', 'AIツールを販売したいユーザー'),
  ('購入者', '#10b981', 'AIツールを購入したいユーザー'),
  ('VIP',    '#fbbf24', '優先サポート対象'),
  ('テスター', '#3b82f6', 'ベータテスト参加者');
