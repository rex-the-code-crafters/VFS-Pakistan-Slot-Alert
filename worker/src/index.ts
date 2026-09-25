import type { Env } from './types';
import { runScheduledCheck } from './scheduler';
import { submitSubscription } from './payments';
import { handleAdmin } from './admin';
import { handleIncomingMessage } from './whatsapp';

export default {
  // HTTP requests
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers for website
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ── Public API ──────────────────────────────────────────────

    // POST /api/subscribe — new subscription request
    if (request.method === 'POST' && url.pathname === '/api/subscribe') {
      const body = await request.json() as any;
      const result = await submitSubscription(env, body);
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // GET /api/routes — list available routes for the signup form
    if (url.pathname === '/api/routes') {
      const { results } = await env.DB.prepare(
        `SELECT code, label FROM routes WHERE active = 1`
      ).all();
      return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // GET /api/status — live slot status (for website dashboard)
    if (url.pathname === '/api/status') {
      const keys = await env.SLOT_STATE.list();
      const statuses: Record<string, any> = {};
      for (const key of keys.keys) {
        const val = await env.SLOT_STATE.get(key.name);
        if (val) statuses[key.name] = JSON.parse(val);
      }
      return new Response(JSON.stringify(statuses), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // ── WhatsApp Webhook ────────────────────────────────────────

    // GET /webhook — WhatsApp verification handshake
    if (request.method === 'GET' && url.pathname === '/webhook') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    // POST /webhook — incoming WhatsApp messages
    if (request.method === 'POST' && url.pathname === '/webhook') {
      const body = await request.json() as any;
      const entry = body?.entry?.[0]?.changes?.[0]?.value;
      const message = entry?.messages?.[0];
      if (message?.type === 'text') {
        const from = message.from;
        const text = message.text?.body || '';
        await handleIncomingMessage(env, from, text);
      }
      return new Response('OK', { status: 200 });
    }

    // ── Admin panel ─────────────────────────────────────────────
    if (url.pathname.startsWith('/admin')) {
      return handleAdmin(request, env);
    }

    return new Response('VFS Alert PK API v1.0', { status: 200 });
  },

  // Cron job — runs every minute
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runScheduledCheck(env);
  },
};
