/**
 * メールテンプレート（初期サンクスメール用）
 */
import { escapeHtml } from './utils.js';

export function renderThankYouText(record) {
  return `${record.name ? record.name + ' 様' : 'お客様'}

この度はFirstPenのウェイティングリストにご登録いただき、誠にありがとうございます。

FirstPenは「AIツール版のAmazon」を目指す、日本初のAIツール専門マーケットプレイスです。
正式リリースに向けて、以下の先行登録特典をご用意しております。

  ▼ 出品者特典
    ・プラットフォーム手数料 3ヶ月完全無料
    ・優先審査による先行出品権

  ▼ 購入者特典
    ・初回購入で使える 1,000円OFFクーポン
    ・限定ツールの先行アクセス権

正式リリース日や追加情報は、こちらのメールアドレス宛にお知らせいたします。

--
FirstPen 運営事務局
https://firstpen-platform.vercel.app/
`;
}

export function renderThankYouHtml(record) {
  const name = escapeHtml(record.name || 'お客様');
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Hiragino Sans','Yu Gothic',sans-serif;color:#f5f5f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#141414;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a;">
<tr><td style="padding:40px 40px 24px;background:linear-gradient(135deg,#1a1a1a 0%,#0a0a0a 100%);border-bottom:1px solid #2a2a2a;">
  <div style="font-size:13px;letter-spacing:.18em;color:#888;">FIRSTPEN · WAITLIST</div>
  <h1 style="margin:12px 0 0;font-size:26px;font-weight:700;color:#fff;">ご登録ありがとうございます</h1>
</td></tr>
<tr><td style="padding:32px 40px;">
  <p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#d4d4d4;">${name === 'お客様' ? '' : name + ' 様'}</p>
  <p style="margin:0 0 24px;font-size:15px;line-height:1.9;color:#d4d4d4;">
    この度は <strong style="color:#fff;">FirstPen</strong> のウェイティングリストにご登録いただき、誠にありがとうございます。<br>
    日本初のAIツール専門マーケットプレイスとして、正式リリースに向けて準備を進めております。
  </p>
  <div style="margin:28px 0;padding:24px;background:#1c1c1c;border:1px solid #2f2f2f;border-radius:12px;">
    <div style="font-size:12px;letter-spacing:.16em;color:#a78bfa;margin-bottom:12px;">▼ 先行登録特典</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:6px 0;font-size:14px;color:#e5e5e5;">🏪 <strong>出品者:</strong> プラットフォーム手数料 3ヶ月完全無料</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#e5e5e5;">⚡ <strong>出品者:</strong> 優先審査による先行出品権</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#e5e5e5;">🎁 <strong>購入者:</strong> 1,000円OFFクーポンプレゼント</td></tr>
      <tr><td style="padding:6px 0;font-size:14px;color:#e5e5e5;">🔑 <strong>購入者:</strong> 限定ツールの先行アクセス権</td></tr>
    </table>
  </div>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.8;color:#a3a3a3;">
    正式リリース日や続報は、こちらのメールアドレス宛にお届けします。
  </p>
  <div style="margin-top:32px;text-align:center;">
    <a href="https://firstpen-platform.vercel.app/" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">ランディングページを開く</a>
  </div>
</td></tr>
<tr><td style="padding:24px 40px;background:#0e0e0e;border-top:1px solid #2a2a2a;text-align:center;">
  <p style="margin:0;font-size:12px;color:#666;">© FirstPen · Powered by INFOTOP</p>
  <p style="margin:8px 0 0;font-size:11px;color:#555;">
    <a href="{{unsubscribe}}" style="color:#666;text-decoration:underline;">配信停止</a>
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function renderAdminNotifyHtml(record) {
  const row = (k, v) => `<tr>
    <td style="padding:8px 12px;background:#f5f5f5;font-size:12px;color:#555;width:120px;border-bottom:1px solid #eee;">${k}</td>
    <td style="padding:8px 12px;font-size:13px;color:#111;border-bottom:1px solid #eee;">${escapeHtml(v || '-')}</td>
  </tr>`;
  return `<!doctype html><html><body style="font-family:sans-serif;background:#fafafa;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
    <div style="padding:16px 20px;background:#111;color:#fff;"><strong>🔔 FirstPen 新規ウェイトリスト登録</strong></div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${row('登録日時', record.created_at)}
      ${row('メール', record.email)}
      ${row('お名前', record.name)}
      ${row('属性', record.role)}
      ${row('興味分野', record.interest)}
      ${row('流入経路', record.source)}
      ${row('国', record.country)}
      ${row('IP', record.ip)}
      ${row('User-Agent', record.user_agent)}
    </table>
  </div>
</body></html>`;
}

export function renderAdminNotifyText(record) {
  return `新規ウェイトリスト登録がありました。

日時      : ${record.created_at}
メール    : ${record.email}
お名前    : ${record.name || '(未入力)'}
属性      : ${record.role || '(未選択)'}
興味分野  : ${record.interest || '(未入力)'}
流入経路  : ${record.source || '(未入力)'}
国        : ${record.country || '?'}
IP        : ${record.ip || '?'}

-- FirstPen Waitlist System`;
}
