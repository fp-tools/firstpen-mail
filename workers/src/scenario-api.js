/**
 * シナリオフロー + ワークフロー管理 API
 */
import { json } from './utils.js';

export async function handleScenarioRequest(request, env, path, method, ch) {
  let m;

  if (path === '/api/admin/scenario-flows' && method === 'GET')  return listFlows(env, ch);
  if (path === '/api/admin/scenario-flows' && method === 'POST') return createFlow(request, env, ch);
  if ((m = mp(path, '/api/admin/scenario-flows/:id')) && method === 'GET')    return getFlow(env, m.id, ch);
  if ((m = mp(path, '/api/admin/scenario-flows/:id')) && method === 'PUT')    return updateFlow(request, env, m.id, ch);
  if ((m = mp(path, '/api/admin/scenario-flows/:id')) && method === 'DELETE') return deleteFlow(env, m.id, ch);
  if ((m = mp(path, '/api/admin/scenario-flows/:id/start'))     && method === 'POST') return startFlowForSubscribers(request, env, m.id, ch);
  if ((m = mp(path, '/api/admin/scenario-flows/:id/instances')) && method === 'GET')  return listInstances(env, m.id, ch);

  if (path === '/api/admin/workflow-instances' && method === 'GET') return listAllInstances(env, ch);
  if ((m = mp(path, '/api/admin/workflow-instances/:id/cancel')) && method === 'POST') return cancelInstance(env, m.id, ch);

  return null;
}

function mp(path, pattern) {
  const pp = pattern.split('/'), up = path.split('/');
  if (pp.length !== up.length) return null;
  const p = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) p[pp[i].slice(1)] = up[i];
    else if (pp[i] !== up[i]) return null;
  }
  return p;
}

async function listFlows(env, ch) {
  const { results } = await env.DB.prepare(`
    SELECT sf.*, nl.name AS newsletter_name,
      (SELECT COUNT(*) FROM workflow_instances wi WHERE wi.flow_id=sf.id AND wi.status='active') AS active_count,
      (SELECT COUNT(*) FROM scenario_steps ss WHERE ss.flow_id=sf.id) AS step_count
    FROM scenario_flows sf
    LEFT JOIN newsletters nl ON nl.id = sf.newsletter_id
    ORDER BY sf.created_at DESC
  `).all();
  return json({ ok: true, items: results || [] }, 200, ch);
}

async function getFlow(env, id, ch) {
  const item = await env.DB.prepare(
    `SELECT sf.*, nl.name AS newsletter_name FROM scenario_flows sf
     LEFT JOIN newsletters nl ON nl.id = sf.newsletter_id WHERE sf.id=?`
  ).bind(id).first();
  if (!item) return json({ ok: false, error: 'Not Found' }, 404, ch);
  const { results: steps } = await env.DB.prepare(
    `SELECT * FROM scenario_steps WHERE flow_id=? ORDER BY step_order ASC`
  ).bind(id).all();
  return json({ ok: true, item: { ...item, steps: steps || [] } }, 200, ch);
}

async function createFlow(request, env, ch) {
  const b = await request.json().catch(() => ({}));
  if (!b.name) return json({ ok: false, error: 'name required' }, 400, ch);
  const r = await env.DB.prepare(
    `INSERT INTO scenario_flows (name, description, trigger_type, newsletter_id, status)
     VALUES (?,?,?,?,?)`
  ).bind(b.name, b.description||'', b.trigger_type||'on_subscribe', b.newsletter_id||null, 'active').run();
  const flowId = r.meta?.last_row_id;
  if (b.steps?.length) await saveSteps(env, flowId, b.steps);
  return json({ ok: true, id: flowId }, 200, ch);
}

async function updateFlow(request, env, id, ch) {
  const b = await request.json().catch(() => ({}));
  await env.DB.prepare(
    `UPDATE scenario_flows SET name=?, description=?, trigger_type=?, newsletter_id=?, status=?, updated_at=? WHERE id=?`
  ).bind(b.name, b.description||'', b.trigger_type||'on_subscribe', b.newsletter_id||null, b.status||'active', new Date().toISOString(), id).run();
  if (b.steps) {
    await env.DB.prepare(`DELETE FROM scenario_steps WHERE flow_id=?`).bind(id).run();
    await saveSteps(env, id, b.steps);
  }
  return json({ ok: true }, 200, ch);
}

async function saveSteps(env, flowId, steps) {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    await env.DB.prepare(`
      INSERT INTO scenario_steps
        (flow_id, step_order, step_type, delay_hours, subject, body_html, body_text,
         condition_type, condition_step_order, yes_next_order, no_next_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      flowId, s.step_order ?? i, s.step_type || 'email',
      s.delay_hours || 0, s.subject || '', s.body_html || '', s.body_text || '',
      s.condition_type || '', s.condition_step_order ?? null,
      s.yes_next_order ?? null, s.no_next_order ?? null
    ).run();
  }
}

async function deleteFlow(env, id, ch) {
  await env.DB.prepare(`DELETE FROM scenario_flows WHERE id=?`).bind(id).run();
  return json({ ok: true }, 200, ch);
}

async function startFlowForSubscribers(request, env, flowId, ch) {
  const b = await request.json().catch(() => ({}));
  const flow = await env.DB.prepare(`SELECT id FROM scenario_flows WHERE id=? AND status='active'`).bind(flowId).first();
  if (!flow) return json({ ok: false, error: 'Flow not found or not active' }, 404, ch);

  const firstStep = await env.DB.prepare(
    `SELECT step_order, delay_hours FROM scenario_steps WHERE flow_id=? ORDER BY step_order ASC LIMIT 1`
  ).bind(flowId).first();
  if (!firstStep) return json({ ok: false, error: 'No steps in flow' }, 400, ch);

  const now = new Date();
  const nextRun = new Date(now.getTime() + (firstStep.delay_hours || 0) * 3600000).toISOString();

  let subscriberIds = Array.isArray(b.subscriber_ids) ? b.subscriber_ids : [];
  if (!subscriberIds.length && b.newsletter_id) {
    const { results } = await env.DB.prepare(
      `SELECT subscriber_id FROM newsletter_subscriptions WHERE newsletter_id=? AND status='active'`
    ).bind(b.newsletter_id).all();
    subscriberIds = (results || []).map(r => r.subscriber_id);
  }
  if (!subscriberIds.length) return json({ ok: false, error: '対象者が0件です' }, 400, ch);

  let started = 0;
  for (const sid of subscriberIds) {
    try {
      await env.DB.prepare(
        `INSERT INTO workflow_instances (flow_id, subscriber_id, current_step_order, next_run_at)
         VALUES (?,?,?,?)`
      ).bind(flowId, sid, firstStep.step_order, nextRun).run();
      started++;
    } catch {}
  }
  return json({ ok: true, started }, 200, ch);
}

async function listInstances(env, flowId, ch) {
  const { results } = await env.DB.prepare(`
    SELECT wi.*, s.email, s.name
    FROM workflow_instances wi JOIN subscribers s ON s.id = wi.subscriber_id
    WHERE wi.flow_id=? ORDER BY wi.started_at DESC LIMIT 200
  `).bind(flowId).all();
  return json({ ok: true, items: results || [] }, 200, ch);
}

async function listAllInstances(env, ch) {
  const { results } = await env.DB.prepare(`
    SELECT wi.id, wi.status, wi.current_step_order, wi.next_run_at,
           s.email, s.name, sf.name AS flow_name
    FROM workflow_instances wi
    JOIN subscribers s ON s.id = wi.subscriber_id
    JOIN scenario_flows sf ON sf.id = wi.flow_id
    WHERE wi.status='active'
    ORDER BY wi.next_run_at ASC LIMIT 200
  `).all();
  return json({ ok: true, items: results || [] }, 200, ch);
}

async function cancelInstance(env, id, ch) {
  await env.DB.prepare(
    `UPDATE workflow_instances SET status='cancelled', updated_at=? WHERE id=?`
  ).bind(new Date().toISOString(), id).run();
  return json({ ok: true }, 200, ch);
}
