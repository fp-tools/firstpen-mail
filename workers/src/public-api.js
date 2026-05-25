/**
 * 公開API: フォーム登録エンドポイント
 */
import { json, isValidEmail } from './utils.js';
import { sendMail, upsertContact } from './sendgrid.js';
import { renderThankYouHtml, renderThankYouText, renderAdminNotifyHtml, renderAdminNotifyText } from './templates.js';

export async function handleWaitlistSubmit(request, env, corsHeaders) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400, corsHeaders); }

  const {
    email, name = '', role = '', interest = '', source = '',
    agreed = false, turnstileToken = '',
  } = body || {};

  if (!agreed) return json({ ok: false, error: '利用規約への同意が必要です' }, 400, corsHeaders);
  if (!email || !isValidEmail(email)) {
    return json({ ok: false, error: '有効なメールアドレスを入力してください' }, 400, corsHeaders);
  }
  if (name && name.length > 100) {
    return json({ ok: false, error: 'お名前が長すぎます' }, 400, corsHeaders);
  }

  // Turnstile検証 (任意)
  if (env.TURNSTILE_SECRET) {
    const ok = await verifyTurnstile(turnstileToken, request.headers.get('CF-Connecting-IP') || '', env.TURNSTILE_SECRET);
    if (!ok) return json({ ok: false, error: 'ボット検証に失敗しました' }, 403, corsHeaders);
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const country = request.cf?.country || '';
  const now = new Date().toISOString();

  // D1に保存 (UNIQUE制約で重複時は更新)
  try {
    await env.DB.prepare(`
      INSERT INTO subscribers (email, name, role, interest, source, country, ip, user_agent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        interest = excluded.interest,
        source = excluded.source,
        country = excluded.country,
        ip = excluded.ip,
        user_agent = excluded.user_agent,
        updated_at = excluded.updated_at,
        status = CASE WHEN subscribers.status = 'unsubscribed' THEN 'active' ELSE subscribers.status END
    `).bind(email, name, role, interest, source, country, ip, ua, now, now).run();
  } catch (e) {
    return json({ ok: false, error: 'データベース保存に失敗しました', detail: e.message }, 500, corsHeaders);
  }

  // 取得したsubscriber_idでタグを自動付与
  const sub = await env.DB.prepare(`SELECT id FROM subscribers WHERE email = ?`).bind(email).first();
  if (sub && role) {
    const tagName = role === 'seller' ? '出品者' : role === 'buyer' ? '購入者' : null;
    if (tagName) {
      const tag = await env.DB.prepare(`SELECT id FROM tags WHERE name = ?`).bind(tagName).first();
      if (tag) {
        await env.DB.prepare(`INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)`)
          .bind(sub.id, tag.id).run();
      }
    }
    if (role === 'both') {
      // 両方のタグを付与
      for (const tn of ['出品者', '購入者']) {
        const t = await env.DB.prepare(`SELECT id FROM tags WHERE name = ?`).bind(tn).first();
        if (t) await env.DB.prepare(`INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)`).bind(sub.id, t.id).run();
      }
    }
  }

  const record = { email, name, role, interest, source, country, ip, user_agent: ua, created_at: now };

  // 並列でメール送信 & Contacts同期
  const tasks = [
    sendMail(env, {
      to: { email, name: name || undefined },
      subject: '【FirstPen】ウェイティングリストへのご登録ありがとうございます',
      html: renderThankYouHtml(record),
      text: renderThankYouText(record),
      categories: ['waitlist', 'thankyou'],
      customArgs: { type: 'thankyou', subscriber_id: String(sub?.id || '') },
    }),
  ];

  const adminEmails = (env.ADMIN_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean);
  if (adminEmails.length > 0) {
    tasks.push(sendMail(env, {
      to: adminEmails.map(e => ({ email: e })),
      subject: `【FirstPen】新規ウェイトリスト登録: ${email}`,
      html: renderAdminNotifyHtml(record),
      text: renderAdminNotifyText(record),
      categories: ['waitlist', 'admin-notify'],
    }));
  }

  if (env.SENDGRID_SYNC_CONTACTS === 'true') {
    tasks.push(upsertContact(env, record).catch(e => console.error('Contact sync failed:', e.message)));
  }

  const results = await Promise.allSettled(tasks);
  const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));

  return json({
    ok: true,
    message: 'ご登録ありがとうございます！確認メールをお送りしました。',
    warnings: errors.length ? errors : undefined,
  }, 200, corsHeaders);
}

async function verifyTurnstile(token, ip, secret) {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.success;
}

/**
 * SendGrid Event Webhook 受信エンドポイント
 * https://sendgrid.kke.co.jp/docs/API_Reference/Webhooks/event.html
 */
export async function handleEventWebhook(request, env) {
  let events;
  try { events = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  if (!Array.isArray(events)) return json({ ok: false, error: 'Expected array' }, 400);

  for (const ev of events) {
    try {
      const email = ev.email || '';
      const eventType = ev.event || '';
      const ts = new Date((ev.timestamp || Date.now() / 1000) * 1000).toISOString();
      const url = ev.url || '';
      const reason = ev.reason || ev.response || '';
      const messageId = ev.sg_message_id || '';
      const subscriberId = parseInt(ev.subscriber_id || '0', 10) || null;
      const campaignId = parseInt(ev.campaign_id || '0', 10) || null;

      await env.DB.prepare(`
        INSERT INTO email_events (subscriber_id, campaign_id, email, event_type, url, reason, message_id, event_ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(subscriberId, campaignId, email, eventType, url, reason, messageId, ts).run();

      // バウンス・配信停止・苦情はステータス更新
      if (['bounce', 'dropped'].includes(eventType)) {
        await env.DB.prepare(`UPDATE subscribers SET status = 'bounced', updated_at = ? WHERE email = ?`).bind(ts, email).run();
      } else if (['unsubscribe', 'group_unsubscribe', 'spamreport'].includes(eventType)) {
        await env.DB.prepare(`UPDATE subscribers SET status = 'unsubscribed', updated_at = ? WHERE email = ?`).bind(ts, email).run();
      }
    } catch (e) {
      console.error('Event ingest error:', e.message);
    }
  }
  return json({ ok: true, received: events.length });
}
