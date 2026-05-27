/**
 * FirstPen Waitlist API - Main Entry Point
 *
 * ルーティング:
 *   GET  /widget.js            ← 埋め込み用JSウィジェット (公開)
 *   POST /api/waitlist         ← フォーム登録 (公開)
 *   POST /api/sendgrid/webhook ← SendGrid Event Webhook
 *   GET  /api/health           ← ヘルスチェック
 *   *    /api/admin/*          ← 管理API (Basic認証必須)
 */
import { json, buildCorsHeaders, requireBasicAuth } from './utils.js';
import { handleWaitlistSubmit, handleEventWebhook } from './public-api.js';
import { handleAdminRequest } from './admin-api.js';
import { widgetScript } from './widget.js';
import { runScenarioEngine } from './scenario-engine.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScenarioEngine(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = buildCorsHeaders(request, env);

    // ---- CORS preflight ----
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ---- ウィジェットJS (公開・キャッシュあり) ----
    if (path === '/widget.js' && request.method === 'GET') {
      return widgetScript(env);
    }

    // ---- ヘルスチェック ----
    if (path === '/api/health' && request.method === 'GET') {
      return json({ ok: true, service: 'firstpen-waitlist', time: new Date().toISOString() }, 200, corsHeaders);
    }

    // ---- 公開API ----
    if (path === '/api/waitlist' && request.method === 'POST') {
      return handleWaitlistSubmit(request, env, corsHeaders);
    }
    if (path === '/api/sendgrid/webhook' && request.method === 'POST') {
      return handleEventWebhook(request, env);
    }

    // ---- 管理API (Basic認証) ----
    if (path.startsWith('/api/admin/')) {
      const authError = requireBasicAuth(request, env);
      if (authError) return authError;
      return handleAdminRequest(request, env, corsHeaders);
    }

    return json({ ok: false, error: 'Not Found', path }, 404, corsHeaders);
  },
};
