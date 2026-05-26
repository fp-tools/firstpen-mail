/**
 * 管理API (Basic認証必須)
 * - /api/admin/subscribers          GET 一覧/検索   POST 新規追加
 * - /api/admin/subscribers/:id      GET 詳細  PUT 更新  DELETE 削除
 * - /api/admin/subscribers/export   GET CSV出力
 * - /api/admin/tags                 GET 一覧 POST 作成
 * - /api/admin/tags/:id             PUT 更新 DELETE 削除
 * - /api/admin/subscribers/:id/tags POST 付与 DELETE 解除
 * - /api/admin/templates            GET 一覧 POST 作成
 * - /api/admin/templates/:id        GET 詳細 PUT 更新 DELETE 削除
 * - /api/admin/campaigns            GET 一覧 POST 作成・送信
 * - /api/admin/campaigns/:id        GET 詳細
 * - /api/admin/step-flows           GET 一覧 POST 作成
 * - /api/admin/step-flows/:id       GET 詳細 PUT 更新 DELETE 削除
 * - /api/admin/stats/overview       GET ダッシュボード統計
 * - /api/admin/stats/events         GET イベント時系列
 */
import { json, text, csvField, toCsv, match } from './utils.js';
import { sendBatchMail, setupEventWebhook, getEventWebhookSettings, syncContactsBulk, requestVerifiedSender, listVerifiedSenders } from './sendgrid.js';

export async function handleAdminRequest(request, env, corsHeaders) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const q = url.searchParams;

  // ---- Subscribers ----
  if (path === '/api/admin/subscribers' && method === 'GET') return listSubscribers(env, q, corsHeaders);
  if (path === '/api/admin/subscribers' && method === 'POST') return createSubscriber(request, env, corsHeaders);
  if (path === '/api/admin/subscribers/export' && method === 'GET') return exportSubscribersCsv(env, q, corsHeaders);

  let m;
  if ((m = match(path, '/api/admin/subscribers/:id')) && method === 'GET')    return getSubscriber(env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/subscribers/:id')) && method === 'PUT')    return updateSubscriber(request, env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/subscribers/:id')) && method === 'DELETE') return deleteSubscriber(env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/subscribers/:id/tags')) && method === 'POST')   return attachTag(request, env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/subscribers/:id/tags')) && method === 'DELETE') return detachTag(request, env, m.id, corsHeaders);

  // ---- Tags ----
  if (path === '/api/admin/tags' && method === 'GET')  return listTags(env, corsHeaders);
  if (path === '/api/admin/tags' && method === 'POST') return createTag(request, env, corsHeaders);
  if ((m = match(path, '/api/admin/tags/:id')) && method === 'PUT')    return updateTag(request, env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/tags/:id')) && method === 'DELETE') return deleteTag(env, m.id, corsHeaders);

  // ---- Templates ----
  if (path === '/api/admin/templates' && method === 'GET')  return listTemplates(env, corsHeaders);
  if (path === '/api/admin/templates' && method === 'POST') return createTemplate(request, env, corsHeaders);
  if ((m = match(path, '/api/admin/templates/:id')) && method === 'GET')    return getTemplate(env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/templates/:id')) && method === 'PUT')    return updateTemplate(request, env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/templates/:id')) && method === 'DELETE') return deleteTemplate(env, m.id, corsHeaders);

  // ---- Campaigns (手動送信) ----
  if (path === '/api/admin/campaigns' && method === 'GET')  return listCampaigns(env, corsHeaders);
  if (path === '/api/admin/campaigns' && method === 'POST') return createAndSendCampaign(request, env, corsHeaders);
  if ((m = match(path, '/api/admin/campaigns/:id')) && method === 'GET') return getCampaign(env, m.id, corsHeaders);

  // ---- Step Flows ----
  if (path === '/api/admin/step-flows' && method === 'GET')  return listStepFlows(env, corsHeaders);
  if (path === '/api/admin/step-flows' && method === 'POST') return createStepFlow(request, env, corsHeaders);
  if ((m = match(path, '/api/admin/step-flows/:id')) && method === 'GET')    return getStepFlow(env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/step-flows/:id')) && method === 'PUT')    return updateStepFlow(request, env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/step-flows/:id')) && method === 'DELETE') return deleteStepFlow(env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/step-flows/:id/toggle')) && method === 'POST') return toggleStepFlow(env, m.id, corsHeaders);

  // ---- Stats ----
  if (path === '/api/admin/stats/overview' && method === 'GET') return statsOverview(env, corsHeaders);
  if (path === '/api/admin/stats/events'   && method === 'GET') return statsEvents(env, q, corsHeaders);

  // ---- Sender Settings ----
  if (path === '/api/admin/sender-settings' && method === 'GET')  return listSenderSettings(env, corsHeaders);
  if (path === '/api/admin/sender-settings' && method === 'POST') return createSenderSetting(request, env, corsHeaders);
  if (path === '/api/admin/sender-settings/sync' && method === 'POST') return syncSendersFromSendGrid(env, corsHeaders);

  // ---- SendGrid Setup ----
  if (path === '/api/admin/sendgrid/webhook-setup'   && method === 'POST') return setupSendGridWebhook(env, corsHeaders);
  if (path === '/api/admin/sendgrid/contacts-sync'   && method === 'POST') return syncContactsToSendGrid(env, corsHeaders);
  if (path === '/api/admin/sendgrid/sender-request'  && method === 'POST') return createVerifiedSenderRequest(request, env, corsHeaders);
  if ((m = match(path, '/api/admin/sender-settings/:id')) && method === 'PUT')    return updateSenderSetting(request, env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/sender-settings/:id')) && method === 'DELETE') return deleteSenderSetting(env, m.id, corsHeaders);
  if ((m = match(path, '/api/admin/sender-settings/:id/default')) && method === 'POST') return setDefaultSender(env, m.id, corsHeaders);

  return json({ ok: false, error: 'Not Found' }, 404, corsHeaders);
}

// ====================================================================
//  Subscribers
// ====================================================================
async function listSubscribers(env, q, ch) {
  const search = q.get('q') || '';
  const role   = q.get('role') || '';
  const status = q.get('status') || '';
  const tagId  = q.get('tag') || '';
  const page   = Math.max(1, parseInt(q.get('page') || '1', 10));
  const perPage= Math.min(200, Math.max(10, parseInt(q.get('per_page') || '50', 10)));
  const offset = (page - 1) * perPage;

  const where = [];
  const args = [];
  if (search) {
    where.push('(s.email LIKE ? OR s.name LIKE ?)');
    args.push(`%${search}%`, `%${search}%`);
  }
  if (role)   { where.push('s.role = ?');   args.push(role); }
  if (status) { where.push('s.status = ?'); args.push(status); }

  let from = 'subscribers s';
  if (tagId) {
    from = 'subscribers s JOIN subscriber_tags st ON st.subscriber_id = s.id';
    where.push('st.tag_id = ?'); args.push(parseInt(tagId, 10));
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const totalRow = await env.DB.prepare(`SELECT COUNT(DISTINCT s.id) AS n FROM ${from} ${whereSql}`).bind(...args).first();
  const total = totalRow?.n || 0;

  const rowsRes = await env.DB.prepare(`
    SELECT s.id, s.email, s.name, s.role, s.interest, s.source, s.status, s.country, s.created_at, s.updated_at
    FROM ${from}
    ${whereSql}
    GROUP BY s.id
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...args, perPage, offset).all();

  const rows = rowsRes.results || [];

  // タグも取得
  if (rows.length) {
    const ids = rows.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const tagsRes = await env.DB.prepare(`
      SELECT st.subscriber_id, t.id AS tag_id, t.name, t.color
      FROM subscriber_tags st JOIN tags t ON t.id = st.tag_id
      WHERE st.subscriber_id IN (${placeholders})
    `).bind(...ids).all();
    const tagMap = {};
    for (const t of (tagsRes.results || [])) {
      (tagMap[t.subscriber_id] ||= []).push({ id: t.tag_id, name: t.name, color: t.color });
    }
    rows.forEach(r => r.tags = tagMap[r.id] || []);
  }

  return json({ ok: true, total, page, per_page: perPage, items: rows }, 200, ch);
}

async function getSubscriber(env, id, ch) {
  const row = await env.DB.prepare(`SELECT * FROM subscribers WHERE id = ?`).bind(id).first();
  if (!row) return json({ ok: false, error: 'Not Found' }, 404, ch);
  const tags = await env.DB.prepare(`
    SELECT t.id, t.name, t.color FROM tags t
    JOIN subscriber_tags st ON st.tag_id = t.id
    WHERE st.subscriber_id = ?
  `).bind(id).all();
  const events = await env.DB.prepare(`
    SELECT event_type, url, reason, event_ts FROM email_events
    WHERE subscriber_id = ? ORDER BY event_ts DESC LIMIT 50
  `).bind(id).all();
  row.tags = tags.results || [];
  row.events = events.results || [];
  return json({ ok: true, item: row }, 200, ch);
}

async function createSubscriber(request, env, ch) {
  const body = await request.json().catch(() => ({}));
  const { email, name = '', role = '', interest = '', source = '' } = body;
  if (!email) return json({ ok: false, error: 'email is required' }, 400, ch);
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(`
      INSERT INTO subscribers (email, name, role, interest, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(email, name, role, interest, source, now, now).run();
    return json({ ok: true, id: result.meta?.last_row_id }, 200, ch);
  } catch (e) {
    return json({ ok: false, error: e.message }, 400, ch);
  }
}

async function updateSubscriber(request, env, id, ch) {
  const body = await request.json().catch(() => ({}));
  const fields = ['name', 'role', 'interest', 'source', 'status'];
  const sets = [], args = [];
  for (const f of fields) if (f in body) { sets.push(`${f} = ?`); args.push(body[f]); }
  if (!sets.length) return json({ ok: false, error: 'No fields to update' }, 400, ch);
  sets.push(`updated_at = ?`); args.push(new Date().toISOString());
  args.push(id);
  await env.DB.prepare(`UPDATE subscribers SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
  return json({ ok: true }, 200, ch);
}

async function deleteSubscriber(env, id, ch) {
  await env.DB.prepare(`DELETE FROM subscribers WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, ch);
}

async function exportSubscribersCsv(env, q, ch) {
  // listSubscribersと同様のフィルタ
  const role = q.get('role') || '', status = q.get('status') || '', tagId = q.get('tag') || '', search = q.get('q') || '';
  const where = []; const args = [];
  if (search) { where.push('(s.email LIKE ? OR s.name LIKE ?)'); args.push(`%${search}%`, `%${search}%`); }
  if (role)   { where.push('s.role = ?');   args.push(role); }
  if (status) { where.push('s.status = ?'); args.push(status); }
  let from = 'subscribers s';
  if (tagId) {
    from = 'subscribers s JOIN subscriber_tags st ON st.subscriber_id = s.id';
    where.push('st.tag_id = ?'); args.push(parseInt(tagId, 10));
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const res = await env.DB.prepare(`
    SELECT s.id, s.email, s.name, s.role, s.interest, s.source, s.status, s.country, s.created_at
    FROM ${from} ${whereSql} GROUP BY s.id ORDER BY s.created_at DESC
  `).bind(...args).all();

  const header = ['ID', 'Email', 'Name', 'Role', 'Interest', 'Source', 'Status', 'Country', 'CreatedAt'];
  const body = (res.results || []).map(r => [r.id, r.email, r.name, r.role, r.interest, r.source, r.status, r.country, r.created_at]);
  const csv = toCsv([header, ...body]);
  const bom = '\uFEFF'; // Excel互換のため
  return new Response(bom + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="subscribers_${new Date().toISOString().slice(0,10)}.csv"`,
      ...ch,
    },
  });
}

// ====================================================================
//  Tags
// ====================================================================
async function listTags(env, ch) {
  const res = await env.DB.prepare(`
    SELECT t.*, (SELECT COUNT(*) FROM subscriber_tags WHERE tag_id = t.id) AS subscriber_count
    FROM tags t ORDER BY t.id
  `).all();
  return json({ ok: true, items: res.results || [] }, 200, ch);
}
async function createTag(request, env, ch) {
  const { name, color = '#a78bfa', description = '' } = await request.json().catch(() => ({}));
  if (!name) return json({ ok: false, error: 'name required' }, 400, ch);
  try {
    const r = await env.DB.prepare(`INSERT INTO tags (name, color, description) VALUES (?, ?, ?)`).bind(name, color, description).run();
    return json({ ok: true, id: r.meta?.last_row_id }, 200, ch);
  } catch (e) { return json({ ok: false, error: e.message }, 400, ch); }
}
async function updateTag(request, env, id, ch) {
  const body = await request.json().catch(() => ({}));
  const sets = [], args = [];
  for (const f of ['name', 'color', 'description']) if (f in body) { sets.push(`${f} = ?`); args.push(body[f]); }
  if (!sets.length) return json({ ok: false, error: 'No fields' }, 400, ch);
  args.push(id);
  await env.DB.prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
  return json({ ok: true }, 200, ch);
}
async function deleteTag(env, id, ch) {
  await env.DB.prepare(`DELETE FROM tags WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, ch);
}
async function attachTag(request, env, subId, ch) {
  const { tag_id } = await request.json().catch(() => ({}));
  if (!tag_id) return json({ ok: false, error: 'tag_id required' }, 400, ch);
  await env.DB.prepare(`INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)`).bind(subId, tag_id).run();
  return json({ ok: true }, 200, ch);
}
async function detachTag(request, env, subId, ch) {
  const { tag_id } = await request.json().catch(() => ({}));
  if (!tag_id) return json({ ok: false, error: 'tag_id required' }, 400, ch);
  await env.DB.prepare(`DELETE FROM subscriber_tags WHERE subscriber_id = ? AND tag_id = ?`).bind(subId, tag_id).run();
  return json({ ok: true }, 200, ch);
}

// ====================================================================
//  Templates
// ====================================================================
async function listTemplates(env, ch) {
  const res = await env.DB.prepare(`SELECT id, name, subject, category, created_at, updated_at FROM templates ORDER BY id DESC`).all();
  return json({ ok: true, items: res.results || [] }, 200, ch);
}
async function getTemplate(env, id, ch) {
  const row = await env.DB.prepare(`SELECT * FROM templates WHERE id = ?`).bind(id).first();
  if (!row) return json({ ok: false, error: 'Not Found' }, 404, ch);
  return json({ ok: true, item: row }, 200, ch);
}
async function createTemplate(request, env, ch) {
  const { name, subject, body_html, body_text = '', category = 'campaign' } = await request.json().catch(() => ({}));
  if (!name || !subject || !body_html) return json({ ok: false, error: 'name/subject/body_html required' }, 400, ch);
  const r = await env.DB.prepare(`
    INSERT INTO templates (name, subject, body_html, body_text, category) VALUES (?, ?, ?, ?, ?)
  `).bind(name, subject, body_html, body_text, category).run();
  return json({ ok: true, id: r.meta?.last_row_id }, 200, ch);
}
async function updateTemplate(request, env, id, ch) {
  const body = await request.json().catch(() => ({}));
  const sets = [], args = [];
  for (const f of ['name', 'subject', 'body_html', 'body_text', 'category']) if (f in body) { sets.push(`${f} = ?`); args.push(body[f]); }
  if (!sets.length) return json({ ok: false, error: 'No fields' }, 400, ch);
  sets.push(`updated_at = ?`); args.push(new Date().toISOString());
  args.push(id);
  await env.DB.prepare(`UPDATE templates SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
  return json({ ok: true }, 200, ch);
}
async function deleteTemplate(env, id, ch) {
  await env.DB.prepare(`DELETE FROM templates WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, ch);
}

// ====================================================================
//  Campaigns (手動メール送信)
// ====================================================================
async function listCampaigns(env, ch) {
  const res = await env.DB.prepare(`SELECT id, name, subject, status, sent_count, failed_count, sent_at, created_at FROM campaigns ORDER BY id DESC LIMIT 100`).all();
  return json({ ok: true, items: res.results || [] }, 200, ch);
}
async function getCampaign(env, id, ch) {
  const row = await env.DB.prepare(`SELECT * FROM campaigns WHERE id = ?`).bind(id).first();
  if (!row) return json({ ok: false, error: 'Not Found' }, 404, ch);
  // 集計
  const stats = await env.DB.prepare(`
    SELECT event_type, COUNT(*) AS cnt FROM email_events WHERE campaign_id = ? GROUP BY event_type
  `).bind(id).all();
  row.event_stats = stats.results || [];
  return json({ ok: true, item: row }, 200, ch);
}

async function createAndSendCampaign(request, env, ch) {
  const body = await request.json().catch(() => ({}));
  const { name, subject, body_html, body_text = '', target = {}, from_sender_id } = body;
  if (!name || !subject || !body_html) return json({ ok: false, error: 'name/subject/body_html required' }, 400, ch);

  // 送信者を解決 (from_sender_id指定 → デフォルト → env変数)
  let fromEmail, fromName;
  if (from_sender_id) {
    const sender = await env.DB.prepare('SELECT from_email, from_name FROM sender_settings WHERE id = ?').bind(from_sender_id).first();
    if (sender) { fromEmail = sender.from_email; fromName = sender.from_name; }
  }
  if (!fromEmail) {
    const def = await env.DB.prepare('SELECT from_email, from_name FROM sender_settings WHERE is_default = 1').first();
    if (def) { fromEmail = def.from_email; fromName = def.from_name; }
  }

  // 配信対象を解決
  const recipients = await resolveRecipients(env, target);
  if (recipients.length === 0) {
    return json({ ok: false, error: '配信対象が0件です' }, 400, ch);
  }

  // キャンペーン保存
  const ins = await env.DB.prepare(`
    INSERT INTO campaigns (name, subject, body_html, body_text, target_query, status)
    VALUES (?, ?, ?, ?, ?, 'sending')
  `).bind(name, subject, body_html, body_text, JSON.stringify(target)).run();
  const campaignId = ins.meta?.last_row_id;

  // 送信実行
  try {
    const result = await sendBatchMail(env, {
      recipients,
      subject, html: body_html, text: body_text,
      categories: ['campaign', `campaign-${campaignId}`],
      customArgs: { campaign_id: String(campaignId) },
      fromEmail,
      fromName,
    });
    await env.DB.prepare(`
      UPDATE campaigns SET status = ?, sent_count = ?, failed_count = ?, sent_at = ? WHERE id = ?
    `).bind(result.failed === 0 ? 'sent' : 'sent', result.sent, result.failed, new Date().toISOString(), campaignId).run();
    return json({ ok: true, campaign_id: campaignId, result }, 200, ch);
  } catch (e) {
    await env.DB.prepare(`UPDATE campaigns SET status = 'failed' WHERE id = ?`).bind(campaignId).run();
    return json({ ok: false, error: e.message, campaign_id: campaignId }, 500, ch);
  }
}

async function resolveRecipients(env, target) {
  // target: { tag_ids: [], roles: [], status: 'active', emails: [] }
  const where = [`s.status = ?`];
  const args = [target.status || 'active'];

  if (Array.isArray(target.roles) && target.roles.length) {
    where.push(`s.role IN (${target.roles.map(() => '?').join(',')})`);
    args.push(...target.roles);
  }
  if (Array.isArray(target.emails) && target.emails.length) {
    where.push(`s.email IN (${target.emails.map(() => '?').join(',')})`);
    args.push(...target.emails);
  }
  let from = 'subscribers s';
  if (Array.isArray(target.tag_ids) && target.tag_ids.length) {
    from = 'subscribers s JOIN subscriber_tags st ON st.subscriber_id = s.id';
    where.push(`st.tag_id IN (${target.tag_ids.map(() => '?').join(',')})`);
    args.push(...target.tag_ids);
  }
  const res = await env.DB.prepare(`
    SELECT DISTINCT s.id, s.email, s.name, s.role FROM ${from} WHERE ${where.join(' AND ')}
  `).bind(...args).all();
  return res.results || [];
}

// ====================================================================
//  Step Flows
// ====================================================================
async function listStepFlows(env, ch) {
  const res = await env.DB.prepare(`
    SELECT sf.*, (SELECT COUNT(*) FROM step_messages WHERE flow_id = sf.id) AS step_count
    FROM step_flows sf ORDER BY sf.id DESC
  `).all();
  return json({ ok: true, items: res.results || [] }, 200, ch);
}
async function getStepFlow(env, id, ch) {
  const flow = await env.DB.prepare(`SELECT * FROM step_flows WHERE id = ?`).bind(id).first();
  if (!flow) return json({ ok: false, error: 'Not Found' }, 404, ch);
  const steps = await env.DB.prepare(`SELECT * FROM step_messages WHERE flow_id = ? ORDER BY step_order`).bind(id).all();
  flow.steps = steps.results || [];
  return json({ ok: true, item: flow }, 200, ch);
}
async function createStepFlow(request, env, ch) {
  const body = await request.json().catch(() => ({}));
  const { name, description = '', trigger_type = 'on_signup', trigger_value = '', steps = [] } = body;
  if (!name) return json({ ok: false, error: 'name required' }, 400, ch);
  const ins = await env.DB.prepare(`
    INSERT INTO step_flows (name, description, trigger_type, trigger_value, status) VALUES (?, ?, ?, ?, 'active')
  `).bind(name, description, trigger_type, trigger_value).run();
  const flowId = ins.meta?.last_row_id;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    await env.DB.prepare(`
      INSERT INTO step_messages (flow_id, step_order, delay_hours, template_id, subject, body_html, body_text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(flowId, i + 1, s.delay_hours || 24, s.template_id || null, s.subject, s.body_html, s.body_text || '').run();
  }
  return json({ ok: true, id: flowId }, 200, ch);
}
async function updateStepFlow(request, env, id, ch) {
  const body = await request.json().catch(() => ({}));
  const sets = [], args = [];
  for (const f of ['name', 'description', 'trigger_type', 'trigger_value', 'status', 'sendgrid_automation_id']) {
    if (f in body) { sets.push(`${f} = ?`); args.push(body[f]); }
  }
  if (sets.length) {
    sets.push(`updated_at = ?`); args.push(new Date().toISOString());
    args.push(id);
    await env.DB.prepare(`UPDATE step_flows SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
  }
  // ステップの差し替え
  if (Array.isArray(body.steps)) {
    await env.DB.prepare(`DELETE FROM step_messages WHERE flow_id = ?`).bind(id).run();
    for (let i = 0; i < body.steps.length; i++) {
      const s = body.steps[i];
      await env.DB.prepare(`
        INSERT INTO step_messages (flow_id, step_order, delay_hours, template_id, subject, body_html, body_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, i + 1, s.delay_hours || 24, s.template_id || null, s.subject, s.body_html, s.body_text || '').run();
    }
  }
  return json({ ok: true }, 200, ch);
}
async function deleteStepFlow(env, id, ch) {
  await env.DB.prepare(`DELETE FROM step_flows WHERE id = ?`).bind(id).run();
  return json({ ok: true }, 200, ch);
}
async function toggleStepFlow(env, id, ch) {
  const row = await env.DB.prepare(`SELECT status FROM step_flows WHERE id = ?`).bind(id).first();
  if (!row) return json({ ok: false, error: 'Not Found' }, 404, ch);
  const next = row.status === 'active' ? 'paused' : 'active';
  await env.DB.prepare(`UPDATE step_flows SET status = ?, updated_at = ? WHERE id = ?`).bind(next, new Date().toISOString(), id).run();
  return json({ ok: true, status: next }, 200, ch);
}

// ====================================================================
//  Sender Settings
// ====================================================================
async function listSenderSettings(env, ch) {
  const res = await env.DB.prepare('SELECT * FROM sender_settings ORDER BY is_default DESC, id').all();
  return json({ ok: true, items: res.results || [] }, 200, ch);
}

async function createSenderSetting(request, env, ch) {
  const { from_email, from_name = '', is_default = 0 } = await request.json().catch(() => ({}));
  if (!from_email) return json({ ok: false, error: 'from_email required' }, 400, ch);
  if (is_default) await env.DB.prepare('UPDATE sender_settings SET is_default = 0').run();
  try {
    const r = await env.DB.prepare(
      'INSERT INTO sender_settings (from_email, from_name, is_default) VALUES (?, ?, ?)'
    ).bind(from_email, from_name, is_default ? 1 : 0).run();
    return json({ ok: true, id: r.meta?.last_row_id }, 200, ch);
  } catch (e) { return json({ ok: false, error: e.message }, 400, ch); }
}

async function syncSendersFromSendGrid(env, ch) {
  if (!env.SENDGRID_API_KEY) return json({ ok: false, error: 'SENDGRID_API_KEY not configured' }, 400, ch);
  const res = await fetch('https://api.sendgrid.com/v3/verified_senders', {
    headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}` },
  });
  if (!res.ok) return json({ ok: false, error: `SendGrid error: ${res.status}` }, 500, ch);
  const data = await res.json();
  const senders = data.results || [];
  let upserted = 0;
  for (const s of senders) {
    if (!s.verified?.status) continue;
    await env.DB.prepare(`
      INSERT INTO sender_settings (from_email, from_name, sendgrid_sender_id, status)
      VALUES (?, ?, ?, 'verified')
      ON CONFLICT(from_email) DO UPDATE SET
        from_name = CASE WHEN sender_settings.from_name = '' THEN excluded.from_name ELSE sender_settings.from_name END,
        sendgrid_sender_id = excluded.sendgrid_sender_id,
        status = 'verified',
        updated_at = datetime('now')
    `).bind(s.from_email, s.from_name || '', s.id || null).run();
    upserted++;
  }
  const items = (await env.DB.prepare('SELECT * FROM sender_settings ORDER BY is_default DESC, id').all()).results || [];
  return json({ ok: true, synced: upserted, total: senders.length, items }, 200, ch);
}

async function updateSenderSetting(request, env, id, ch) {
  const body = await request.json().catch(() => ({}));
  const sets = [], args = [];
  for (const f of ['from_name', 'status']) if (f in body) { sets.push(`${f} = ?`); args.push(body[f]); }
  if (body.is_default !== undefined) {
    if (body.is_default) await env.DB.prepare('UPDATE sender_settings SET is_default = 0').run();
    sets.push('is_default = ?'); args.push(body.is_default ? 1 : 0);
  }
  if (!sets.length) return json({ ok: false, error: 'No fields' }, 400, ch);
  sets.push('updated_at = ?'); args.push(new Date().toISOString());
  args.push(id);
  await env.DB.prepare(`UPDATE sender_settings SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
  return json({ ok: true }, 200, ch);
}

async function deleteSenderSetting(env, id, ch) {
  const row = await env.DB.prepare('SELECT is_default FROM sender_settings WHERE id = ?').bind(id).first();
  if (!row) return json({ ok: false, error: 'Not Found' }, 404, ch);
  if (row.is_default) return json({ ok: false, error: 'デフォルト送信者は削除できません' }, 400, ch);
  await env.DB.prepare('DELETE FROM sender_settings WHERE id = ?').bind(id).run();
  return json({ ok: true }, 200, ch);
}

async function setDefaultSender(env, id, ch) {
  const row = await env.DB.prepare('SELECT id FROM sender_settings WHERE id = ?').bind(id).first();
  if (!row) return json({ ok: false, error: 'Not Found' }, 404, ch);
  await env.DB.prepare('UPDATE sender_settings SET is_default = 0').run();
  await env.DB.prepare('UPDATE sender_settings SET is_default = 1, updated_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
  return json({ ok: true }, 200, ch);
}

// ====================================================================
//  Stats
// ====================================================================
async function statsOverview(env, ch) {
  const total      = (await env.DB.prepare(`SELECT COUNT(*) n FROM subscribers`).first())?.n || 0;
  const active     = (await env.DB.prepare(`SELECT COUNT(*) n FROM subscribers WHERE status='active'`).first())?.n || 0;
  const unsub      = (await env.DB.prepare(`SELECT COUNT(*) n FROM subscribers WHERE status='unsubscribed'`).first())?.n || 0;
  const bounced    = (await env.DB.prepare(`SELECT COUNT(*) n FROM subscribers WHERE status='bounced'`).first())?.n || 0;
  const today      = (await env.DB.prepare(`SELECT COUNT(*) n FROM subscribers WHERE date(created_at)=date('now')`).first())?.n || 0;
  const last7d     = (await env.DB.prepare(`SELECT COUNT(*) n FROM subscribers WHERE created_at >= datetime('now','-7 days')`).first())?.n || 0;
  const last30d    = (await env.DB.prepare(`SELECT COUNT(*) n FROM subscribers WHERE created_at >= datetime('now','-30 days')`).first())?.n || 0;

  // role別
  const roleRes = await env.DB.prepare(`SELECT role, COUNT(*) n FROM subscribers GROUP BY role`).all();
  // イベント集計 (直近30日)
  const eventRes = await env.DB.prepare(`
    SELECT event_type, COUNT(*) n FROM email_events WHERE event_ts >= datetime('now','-30 days') GROUP BY event_type
  `).all();
  // 日別登録推移 (直近30日)
  const dailyRes = await env.DB.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS n FROM subscribers
    WHERE created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d
  `).all();

  const deliveredN = (eventRes.results || []).find(r => r.event_type === 'delivered')?.n || 0;
  const openN  = (eventRes.results || []).find(r => r.event_type === 'open')?.n || 0;
  const clickN = (eventRes.results || []).find(r => r.event_type === 'click')?.n || 0;
  const bounceN= (eventRes.results || []).find(r => r.event_type === 'bounce')?.n || 0;

  return json({
    ok: true,
    subscribers: { total, active, unsubscribed: unsub, bounced, today, last7d, last30d },
    by_role: roleRes.results || [],
    email_stats_30d: {
      delivered: deliveredN, open: openN, click: clickN, bounce: bounceN,
      open_rate:  deliveredN ? (openN / deliveredN) : 0,
      click_rate: deliveredN ? (clickN / deliveredN) : 0,
      bounce_rate: deliveredN ? (bounceN / (deliveredN + bounceN)) : 0,
    },
    daily_signups_30d: dailyRes.results || [],
  }, 200, ch);
}
async function statsEvents(env, q, ch) {
  const days = Math.min(90, Math.max(1, parseInt(q.get('days') || '30', 10)));
  const res = await env.DB.prepare(`
    SELECT date(event_ts) AS d, event_type, COUNT(*) AS n
    FROM email_events WHERE event_ts >= datetime('now', ?)
    GROUP BY d, event_type ORDER BY d
  `).bind(`-${days} days`).all();
  return json({ ok: true, days, series: res.results || [] }, 200, ch);
}

// ====================================================================
//  SendGrid セットアップ
// ====================================================================

async function setupSendGridWebhook(env, ch) {
  const webhookUrl = `${env.API_BASE}/api/sendgrid/webhook`;
  try {
    await setupEventWebhook(env, webhookUrl);
    const current = await getEventWebhookSettings(env);
    return json({ ok: true, url: webhookUrl, enabled: current?.enabled ?? true }, 200, ch);
  } catch (e) {
    return json({ ok: false, error: e.message }, 500, ch);
  }
}

async function syncContactsToSendGrid(env, ch) {
  const { results } = await env.DB.prepare(
    `SELECT id, email, name FROM subscribers WHERE status = 'active' LIMIT 10000`
  ).all();
  if (!results?.length) return json({ ok: true, synced: 0 }, 200, ch);
  try {
    const r = await syncContactsBulk(env, results);
    return json({ ok: true, ...r }, 200, ch);
  } catch (e) {
    return json({ ok: false, error: e.message }, 500, ch);
  }
}

async function createVerifiedSenderRequest(request, env, ch) {
  const body = await request.json();
  if (!body.from_email || !body.from_name) {
    return json({ ok: false, error: 'from_email と from_name は必須' }, 400, ch);
  }
  try {
    const r = await requestVerifiedSender(env, body);
    // DBにも仮登録 (status: pending)
    await env.DB.prepare(
      `INSERT OR IGNORE INTO sender_settings (from_email, from_name, status, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?)`
    ).bind(body.from_email, body.from_name, new Date().toISOString(), new Date().toISOString()).run();
    return json({ ok: true, result: r, note: '確認メールをご確認ください。リンクをクリックすると認証完了です。' }, 200, ch);
  } catch (e) {
    return json({ ok: false, error: e.message }, 500, ch);
  }
}
