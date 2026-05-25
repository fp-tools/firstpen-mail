# セットアップ手順書 (v2)

完全構築まで **約30〜40分**。

---

## STEP 1: SendGrid

### 1-1. APIキー発行
1. https://sendgrid.com/ でアカウント作成
2. **Settings → Sender Authentication** で送信元アドレスを認証
3. **Settings → API Keys → Create API Key**
   - 権限: **Restricted Access** で `Mail Send → Full Access`
   - 必要に応じて `Marketing → Read/Write` も付与 (Contacts同期する場合)

---

## STEP 2: Cloudflare 準備

### 2-1. アカウント作成
- https://dash.cloudflare.com/sign-up

### 2-2. Wrangler セットアップ
```bash
cd workers
npm install
npx wrangler login
```

### 2-3. D1 データベース作成
```bash
npx wrangler d1 create firstpen-waitlist
```
コンソールに以下のような出力:
```
database_name = "firstpen-waitlist"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```
この `database_id` を `workers/wrangler.toml` の `[[d1_databases]]` セクションに貼り付け。

### 2-4. マイグレーション実行
```bash
# ローカル (wrangler dev で開発する場合)
npx wrangler d1 migrations apply firstpen-waitlist --local

# 本番 (Cloudflare側に反映)
npx wrangler d1 migrations apply firstpen-waitlist --remote
```

### 2-5. シークレット登録
```bash
npx wrangler secret put SENDGRID_API_KEY
# → SG.xxxxxxxxxxx (STEP 1で取得)

npx wrangler secret put FROM_EMAIL
# → no-reply@your-domain.com (Sender Verified済)

npx wrangler secret put ADMIN_EMAIL
# → admin@your-domain.com,soga.naoya@itghd.jp

npx wrangler secret put ADMIN_PASS
# → 管理画面用の強力なパスワード (例: 32文字ランダム)
```

> 💡 ユーザー名は `wrangler.toml` の `[vars] ADMIN_USER` で変更可能 (デフォルト `admin`)

### 2-6. wrangler.toml の最終調整
```toml
[vars]
FROM_NAME = "FirstPen 運営事務局"
ALLOWED_ORIGIN = "https://firstpen-platform.vercel.app,https://<your-user>.github.io"
ADMIN_USER = "admin"
API_BASE = "https://firstpen-waitlist-api.<your-subdomain>.workers.dev"  # デプロイ後に確定
```

### 2-7. デプロイ
```bash
npx wrangler deploy
```
完了すると以下が払い出される:
```
https://firstpen-waitlist-api.<your-subdomain>.workers.dev
```

### 2-8. ヘルスチェック
```bash
curl https://firstpen-waitlist-api.<your-subdomain>.workers.dev/api/health
# {"ok":true,"service":"firstpen-waitlist","time":"..."}
```

### 2-9. API_BASE を更新して再デプロイ
`wrangler.toml` の `API_BASE` に上記URLを記入し、もう一度 `npx wrangler deploy`。
これでウィジェットJS (`/widget.js`) が正しいAPIを叩くようになります。

---

## STEP 3: 管理画面のデプロイ (GitHub Pages)

### 3-1. `admin/app.js` を編集
ファイル冒頭の以下の行を Workers URL に書き換え:
```js
const DEFAULT_API_BASE = 'https://firstpen-waitlist-api.<your-subdomain>.workers.dev';
```

> 💡 デプロイ後でも管理画面の「設定」ページから変更可能 (localStorageに保存)

### 3-2. GitHub Pages 有効化
1. リポジトリ Settings → Pages → **Source = GitHub Actions**
2. mainブランチへpush
3. Actions タブで `Deploy GitHub Pages` ワークフローが完走することを確認

### 3-3. アクセス
`https://<your-user>.github.io/<repo>/` にアクセス
→ ブラウザのBasic認証ダイアログが表示される
→ `ADMIN_USER` / `ADMIN_PASS` を入力してログイン

---

## STEP 4: 既存ページへの埋め込み

### 4-1. waitlist.html (Vercel側) を修正
既存の `firstpen-platform.vercel.app/waitlist.html` の任意の位置に以下を追加:

```html
<!-- 表示位置 -->
<div data-firstpen-form data-theme="dark"
     data-title="ウェイティングリストに登録"
     data-subtitle="1分で完了 · 完全無料"></div>

<!-- ページ末尾 -->
<script src="https://firstpen-waitlist-api.<your-subdomain>.workers.dev/widget.js" defer></script>
```

### 4-2. ライトテーマで使う場合
```html
<div data-firstpen-form data-theme="light"></div>
```

### 4-3. 動作確認
1. ブラウザでページを開く
2. テスト用メールアドレスで登録
3. 確認:
   - [ ] フォームに成功メッセージ「ご登録ありがとうございます🎉」が表示
   - [ ] 入力したメールアドレスにサンクスメールが届く
   - [ ] `ADMIN_EMAIL` に通知が届く
   - [ ] 管理画面 → 登録者一覧に新規行が表示
   - [ ] 自動で「出品者」または「購入者」タグが付与されている

---

## STEP 5: SendGrid Event Webhook (任意・推奨)

開封・クリック・バウンス等を自動でDB記録するために設定します。

1. SendGrid Dashboard → **Settings → Mail Settings → Event Webhook**
2. **HTTP POST URL** に以下を設定:
   ```
   https://firstpen-waitlist-api.<your-subdomain>.workers.dev/api/sendgrid/webhook
   ```
3. **Actions** から以下を有効化:
   - Delivered, Opened, Clicked, Bounced, Dropped, Unsubscribed, Spam Reports
4. **Test Your Integration** ボタンで疎通テスト
5. 管理画面の登録者詳細にイベントが表示されるか確認

---

## STEP 6: SendGrid Automation 連携 (ステップメール)

ステップメールは「定義は管理画面・実配信はSendGrid Automation」のハイブリッド運用です。

### 6-1. 管理画面でフローを定義
1. 管理画面 → **ステップメール → + 新規フロー**
2. フロー名・トリガー・ステップを入力
3. 各ステップの遅延時間・件名・HTML本文を入力
4. 保存

### 6-2. SendGrid側で Automation 作成
1. SendGrid Dashboard → **Marketing → Automations → Create Automation**
2. トリガー: 「Contact added to list」
3. 各ステップを SendGrid 側にも作成 (管理画面の定義をコピペ)
4. Automation を Save & Activate

### 6-3. AutomationIDを管理画面に保存
1. SendGrid側のAutomationのURLから ID を取得
2. 管理画面 → ステップメール → 該当フローを編集 → 「SendGrid Automation ID」欄に貼り付け
3. 保存

> 💡 将来的に SendGrid Automation API が解放されれば、この同期は完全自動化できます。

### 6-4. Contacts同期を有効化
管理画面で定義したフローを実際に発火させるには、Workersで `SENDGRID_SYNC_CONTACTS="true"` に設定:
```bash
npx wrangler deploy
```
あるいは `wrangler.toml` の `[vars]` を編集して再デプロイ。

これで新規登録があった際に自動でSendGrid Contactsに追加され、Automation が起動します。

---

## STEP 7: GitHub Actions 自動デプロイ (任意)

### Workers 自動デプロイ
1. Cloudflare Dashboard → My Profile → API Tokens → **Create Token**
   - テンプレート: `Edit Cloudflare Workers`
2. GitHub リポジトリ Settings → Secrets and variables → Actions
   - `CLOUDFLARE_API_TOKEN` = 上記トークン
   - `CLOUDFLARE_ACCOUNT_ID` = Cloudflare Dashboardのトップ右に表示されるID

これで `workers/` 配下を変更してpushすれば自動デプロイされます。

---

## トラブルシューティング

| エラー | 原因 | 対処 |
|---|---|---|
| 管理画面で「認証が必要です」 | Basic認証未通過 | ADMIN_USER/PASSを再確認 |
| 401 SendGrid | APIキー誤り | `wrangler secret put SENDGRID_API_KEY` で再登録 |
| 403 SendGrid | Sender未認証 | SendGrid DashboardでFROM_EMAILを認証 |
| D1 SQL Error | スキーマ未適用 | `wrangler d1 migrations apply firstpen-waitlist --remote` |
| CORSエラー | ALLOWED_ORIGIN不一致 | `wrangler.toml`を更新→再デプロイ |
| ウィジェットがロードしない | API_BASEミス | `wrangler.toml`の`API_BASE`を確認、再デプロイ |
| Event Webhookが届かない | URL設定誤り | SendGrid側で疎通テストを実行 |

### ログ確認
```bash
cd workers
npx wrangler tail
# Workersのリアルタイムログ
```

### D1直接操作
```bash
# 登録者数を確認
npx wrangler d1 execute firstpen-waitlist --remote --command="SELECT COUNT(*) FROM subscribers"

# 全テーブル一覧
npx wrangler d1 execute firstpen-waitlist --remote --command="SELECT name FROM sqlite_master WHERE type='table'"

# 開封率TOP10
npx wrangler d1 execute firstpen-waitlist --remote --command="SELECT email, COUNT(*) opens FROM email_events WHERE event_type='open' GROUP BY email ORDER BY opens DESC LIMIT 10"
```
