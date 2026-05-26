-- 送信者設定テーブル
CREATE TABLE IF NOT EXISTS sender_settings (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  from_email          TEXT NOT NULL UNIQUE,
  from_name           TEXT NOT NULL DEFAULT '',
  is_default          INTEGER NOT NULL DEFAULT 0,
  sendgrid_sender_id  INTEGER DEFAULT NULL,
  status              TEXT NOT NULL DEFAULT 'verified',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 初期データ: 現在の送信者を登録
INSERT OR IGNORE INTO sender_settings (from_email, from_name, is_default, status)
VALUES ('soga.naoya@itghd.jp', 'FirstPen 運営事務局', 1, 'verified');
