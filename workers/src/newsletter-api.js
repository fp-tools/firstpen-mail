/**
 * メールマガジン + 購読管理 API
 */
import { json } from './utils.js';

export async function handleNewsletterRequest(request, env, path, method, ch) {
  const { match } = await import('./utils.js');
  let m;

  if (path === '/api/admin/newsletters' && method === 'GET')  return listNewsletters(env, ch);
  if (path === '/api/admin/newsletters' && method === 'POST') return createNewsletter(request, env, ch);
  if ((m = matchPath(path, '/api/admin/newsletters/:id')) && method === 'GET')    return getNewsletter(env, m.id, ch);
  if ((m = matchPath(path, '/api/admin/newsletters/:id')) && method === 'PUT')    return updateNewsletter(request, env, m.id, ch);
  if ((m = matchPath(path, '/api/admin/newsletters/:id')) && method === 'DELETE') return deleteNewsletter(env, m.id, ch);
  if ((m = matchPath(path, '/api/admin/newsletters/:id/subscriptions')) && method === 'GET')  return listSubscriptions(env, m.id, ch);
  if ((m = matchPath(path, '/api/admin/newsletters/:id/subscribe'))     && method === 'POST') return subscribeMany(request, env, m.id, ch);
  if ((m = matchPath(path, '/api/admin/newsletters/:id/unsubscribe'))   && method === 'POST') return unsubscribeMany(request, env, m.id, ch);
  return null;
}

function matchPath(path, pattern) {
  const pParts = pattern.split('/');
  const uParts = path.split('/');
  if (pParts.length !== uParts.length) return null;
  const params = {};
  for (let i = 0; i < pParts.length; i++) {
    if (pParts[i].startsWith(':')) params[pParts[i].slice(1)] = uParts[i];
    else if (pParts[i] !== uParts[i]) return null;
  }
  return params;
}

async function listNewsletters(env, ch) {
  const { results } = await env.DB.prepare(`
    SELECT n.*, ss.from_email, ss.from_name,
           (SELECT COUNT(*) FROM newsletter_subscriptions ns WHERE ns.newsletter_id = n.id AND ns.status='active') AS subscriber_count
    FROM newsletters n
    LEFT JOIN sender_settings ss ON ss.id = n.from_sender_id
    ORDER BY n.created_at DESC
  `).all();
  return json({ ok: true, items: results || [] }, 200, ch);
}

async function getNewsletter(env, id, ch) {
  const item = await env.DB.prepare(
    `SELECT n.*, ss.from_email, ss.from_name FROM newsletters n
     LEFT JOIN sender_settings ss ON ss.id = n.from_sender_id WHERE n.id=?`
  ).bind(id).first();
  if (!item) return json({ ok: false, error: 'Not Found' }, 404, ch);
  const { results: flows } = await env.DB.prepare(
    `SELECT id, name, status, trigger_type FROM scenario_flows WHERE newsletter_id=?`
  ).bind(id).all();
  return json({ ok: true, item: { ...item, flows: flows || [] } }, 200, ch);
}

async function createNewsletter(request, env, ch) {
  const b = await request.json().catch(() => ({}));
  if (!b.name || !b.slug) return json({ ok: false, error: 'name と slug は必須' }, 400, ch);
  try {
    const r = await env.DB.prepare(
      `INSERT INTO newsletters (name, description, slug, status, from_sender_id, reply_to)
       VALUES (?,?,?,?,?,?)`
    ).bind(b.name, b.description||'', b.slug, b.status||'active', b.from_sender_id||null, b.reply_to||'').run();
    return json({ ok: true, id: r.meta?.last_row_id }, 200, ch);
  } catch (e) {
    return json({ ok: false, error: e.message.includes('UNIQUE') ? 'そのslugは既に使われています' : e.message }, 400, ch);
  }
}

async function updateNewsletter(request, env, id, ch) {
  const b = await request.json().catch(() => ({}));
  await env.DB.prepare(
    `UPDATE newsletters SET name=?, description=?, status=?, from_sender_id=?, reply_to=?, updated_at=? WHERE id=?`
  ).bind(b.name, b.description||'', b.status||'active', b.from_sender_id||null, b.reply_to||'', new Date().toISOString(), id).run();
  return json({ ok: true }, 200, ch);
}

async function deleteNewsletter(env, id, ch) {
  await env.DB.prepare(`DELETE FROM newsletters WHERE id=?`).bind(id).run();
  return json({ ok: true }, 200, ch);
}

async function listSubscriptions(env, newsletterId, ch) {
  const { results } = await env.DB.prepare(`
    SELECT ns.*, s.email, s.name, s.role, s.status AS subscriber_status
    FROM newsletter_subscriptions ns
    JOIN subscribers s ON s.id = ns.subscriber_id
    WHERE ns.newsletter_id = ?
    ORDER BY ns.opted_in_at DESC
    LIMIT 500
  `).bind(newsletterId).all();
  return json({ ok: true, items: results || [] }, 200, ch);
}

async function subscribeMany(request, env, newsletterId, ch) {
  const b = await request.json().catch(() => ({}));
  const ids = Array.isArray(b.subscriber_ids) ? b.subscriber_ids : [];
  if (!ids.length) return json({ ok: false, error: 'subscriber_ids required' }, 400, ch);
  let added = 0;
  for (const sid of ids) {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO newsletter_subscriptions (newsletter_id, subscriber_id) VALUES (?,?)`
      ).bind(newsletterId, sid).run();
      await env.DB.prepare(
        `UPDATE newsletter_subscriptions SET status='active', opted_out_at=NULL WHERE newsletter_id=? AND subscriber_id=?`
      ).bind(newsletterId, sid).run();
      added++;
    } catch {}
  }
  return json({ ok: true, added }, 200, ch);
}

async function unsubscribeMany(request, env, newsletterId, ch) {
  const b = await request.json().catch(() => ({}));
  const ids = Array.isArray(b.subscriber_ids) ? b.subscriber_ids : [];
  for (const sid of ids) {
    await env.DB.prepare(
      `UPDATE newsletter_subscriptions SET status='unsubscribed', opted_out_at=? WHERE newsletter_id=? AND subscriber_id=?`
    ).bind(new Date().toISOString(), newsletterId, sid).run();
  }
  return json({ ok: true }, 200, ch);
}
