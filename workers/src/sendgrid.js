/**
 * SendGrid API v3 ラッパー
 */

const SG_BASE = 'https://api.sendgrid.com/v3';

async function sgFetch(env, path, options = {}) {
  if (!env.SENDGRID_API_KEY) throw new Error('SENDGRID_API_KEY is not set');
  const res = await fetch(`${SG_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SendGrid ${res.status} ${path}: ${text}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

/**
 * メール送信 (Mail Send v3)
 */
export async function sendMail(env, { to, subject, html, text, categories = [], customArgs = {}, replyTo }) {
  const personalizations = (Array.isArray(to) ? to : [to]).map(addr => ({
    to: typeof addr === 'string' ? [{ email: addr }] : [addr],
    subject,
  }));
  return sgFetch(env, '/mail/send', {
    method: 'POST',
    body: JSON.stringify({
      personalizations,
      from: { email: env.FROM_EMAIL, name: env.FROM_NAME || 'FirstPen' },
      ...(replyTo ? { reply_to: { email: replyTo } } : {}),
      content: [
        ...(text ? [{ type: 'text/plain', value: text }] : []),
        { type: 'text/html', value: html },
      ],
      categories: ['firstpen', ...categories],
      custom_args: customArgs,
      tracking_settings: {
        click_tracking: { enable: true, enable_text: false },
        open_tracking:  { enable: true },
      },
    }),
  });
}

/**
 * 一斉送信 (個別のpersonalizationsを最大1000件まで一度に)
 */
export async function sendBatchMail(env, { recipients, subject, html, text, categories = [], customArgs = {} }) {
  // SendGridは1リクエストあたり最大1000件のpersonalizations
  const CHUNK = 1000;
  const results = { sent: 0, failed: 0, errors: [] };

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    const personalizations = chunk.map(r => ({
      to: [{ email: r.email, name: r.name || undefined }],
      subject: replaceVars(subject, r),
      substitutions: {
        '{{name}}'  : r.name  || '',
        '{{email}}' : r.email || '',
        '{{role}}'  : r.role  || '',
      },
      custom_args: { ...customArgs, subscriber_id: String(r.id || '') },
    }));

    try {
      await sgFetch(env, '/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          personalizations,
          from: { email: env.FROM_EMAIL, name: env.FROM_NAME || 'FirstPen' },
          content: [
            ...(text ? [{ type: 'text/plain', value: text }] : []),
            { type: 'text/html', value: html },
          ],
          categories: ['firstpen', ...categories],
          custom_args: customArgs,
          tracking_settings: {
            click_tracking: { enable: true, enable_text: false },
            open_tracking:  { enable: true },
            subscription_tracking: { enable: true },
          },
        }),
      });
      results.sent += chunk.length;
    } catch (e) {
      results.failed += chunk.length;
      results.errors.push(e.message);
    }
  }
  return results;
}

function replaceVars(template, vars) {
  return String(template || '')
    .replaceAll('{{name}}', vars.name || '')
    .replaceAll('{{email}}', vars.email || '')
    .replaceAll('{{role}}', vars.role || '');
}

// ============================================================
//  Marketing Contacts API (連絡先同期)
// ============================================================

/**
 * Contactsを追加または更新
 */
export async function upsertContact(env, subscriber) {
  return sgFetch(env, '/marketing/contacts', {
    method: 'PUT',
    body: JSON.stringify({
      contacts: [{
        email: subscriber.email,
        first_name: subscriber.name || undefined,
        custom_fields: {},
      }],
    }),
  });
}

// ============================================================
//  Single Sends API (一斉配信)
// ============================================================

export async function createSingleSend(env, { name, subject, htmlContent, plainContent, senderId, listIds = [] }) {
  return sgFetch(env, '/marketing/singlesends', {
    method: 'POST',
    body: JSON.stringify({
      name,
      send_to: { list_ids: listIds },
      email_config: {
        subject,
        html_content: htmlContent,
        plain_content: plainContent || '',
        sender_id: senderId,
        suppression_group_id: null,
      },
    }),
  });
}

// ============================================================
//  Stats API
// ============================================================

/**
 * カテゴリ別統計を取得 (FirstPen全体の集計用)
 */
export async function getCategoryStats(env, { startDate, endDate, categories = ['firstpen'] }) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    aggregated_by: 'day',
    categories: categories.join(','),
  });
  return sgFetch(env, `/categories/stats?${params}`);
}
