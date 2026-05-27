/**
 * シナリオ自動実行エンジン (Cron: every 5 min)
 */
import { sendMail } from './sendgrid.js';

export async function runScenarioEngine(env) {
  const now = new Date().toISOString();
  const { results: instances } = await env.DB.prepare(`
    SELECT wi.id, wi.flow_id, wi.subscriber_id, wi.current_step_order, wi.status,
           s.email, s.name, s.role
    FROM workflow_instances wi
    JOIN subscribers s ON s.id = wi.subscriber_id
    WHERE wi.status = 'active' AND wi.next_run_at <= ?
    LIMIT 100
  `).bind(now).all();

  for (const inst of (instances || [])) {
    try { await processInstance(env, inst); }
    catch (e) {
      await env.DB.prepare(
        `UPDATE workflow_instances SET status='error', updated_at=? WHERE id=?`
      ).bind(new Date().toISOString(), inst.id).run();
    }
  }
}

async function processInstance(env, inst) {
  const { results: steps } = await env.DB.prepare(
    `SELECT * FROM scenario_steps WHERE flow_id=? ORDER BY step_order ASC`
  ).bind(inst.flow_id).all();
  if (!steps?.length) { await finishInstance(env, inst.id); return; }

  const order = inst.current_step_order ?? steps[0].step_order;
  const step = steps.find(s => s.step_order === order);
  if (!step) { await finishInstance(env, inst.id); return; }

  let nextOrder = null;

  if (step.step_type === 'email') {
    await sendStepEmail(env, inst, step);
    await env.DB.prepare(
      `INSERT INTO workflow_step_logs (instance_id, step_order, sent_at, result) VALUES (?,?,?,'sent')`
    ).bind(inst.id, step.step_order, new Date().toISOString()).run();
    const next = steps.find(s => s.step_order > step.step_order && s.step_type !== 'condition');
    nextOrder = next?.step_order ?? null;
    // check if next is condition
    const nextStep = steps.find(s => s.step_order > step.step_order);
    if (nextStep) nextOrder = nextStep.step_order;
  } else if (step.step_type === 'condition') {
    const met = await checkCondition(env, inst, step);
    nextOrder = met ? step.yes_next_order : step.no_next_order;
  } else if (step.step_type === 'wait') {
    const nextStep = steps.find(s => s.step_order > step.step_order);
    nextOrder = nextStep?.step_order ?? null;
  }

  if (nextOrder != null) {
    const nextStep = steps.find(s => s.step_order === nextOrder);
    const delay = nextStep?.delay_hours ?? 0;
    const nextRun = new Date(Date.now() + delay * 3600000).toISOString();
    await env.DB.prepare(
      `UPDATE workflow_instances SET current_step_order=?, next_run_at=?, updated_at=? WHERE id=?`
    ).bind(nextOrder, nextRun, new Date().toISOString(), inst.id).run();
  } else {
    await finishInstance(env, inst.id);
  }
}

async function sendStepEmail(env, inst, step) {
  const flow = await env.DB.prepare(`
    SELECT sf.*, ss.from_email, ss.from_name
    FROM scenario_flows sf
    LEFT JOIN newsletters nl ON nl.id = sf.newsletter_id
    LEFT JOIN sender_settings ss ON ss.id = nl.from_sender_id
    WHERE sf.id = ?
  `).bind(inst.flow_id).first();

  const fromEmail = flow?.from_email || env.FROM_EMAIL;
  const fromName  = flow?.from_name  || env.FROM_NAME || 'FirstPen';
  const vars = { name: inst.name || '', email: inst.email || '', role: inst.role || '' };
  const replaceVars = t => String(t || '')
    .replaceAll('{{name}}', vars.name)
    .replaceAll('{{email}}', vars.email)
    .replaceAll('{{role}}', vars.role);

  await sendMail(env, {
    to: inst.email,
    subject: replaceVars(step.subject),
    html: replaceVars(step.body_html),
    text: replaceVars(step.body_text),
    categories: ['scenario', `flow-${inst.flow_id}`],
    customArgs: { workflow_instance_id: String(inst.id), step_order: String(step.step_order) },
  });
}

async function checkCondition(env, inst, step) {
  if (!step.condition_type || step.condition_step_order == null) return false;
  const log = await env.DB.prepare(
    `SELECT sent_at FROM workflow_step_logs WHERE instance_id=? AND step_order=? LIMIT 1`
  ).bind(inst.id, step.condition_step_order).first();
  if (!log) return false;

  const evtType = step.condition_type.includes('open') ? 'open' : 'click';
  const event = await env.DB.prepare(`
    SELECT id FROM email_events
    WHERE subscriber_id=? AND event_ts >= ? AND event_type=?
    LIMIT 1
  `).bind(inst.subscriber_id, log.sent_at, evtType).first();

  const occurred = !!event;
  return step.condition_type.startsWith('not_') ? !occurred : occurred;
}

async function finishInstance(env, id) {
  await env.DB.prepare(
    `UPDATE workflow_instances SET status='completed', updated_at=? WHERE id=?`
  ).bind(new Date().toISOString(), id).run();
}
