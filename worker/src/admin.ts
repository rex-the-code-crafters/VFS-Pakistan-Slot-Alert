import type { Env } from './types';
import { confirmPayment } from './payments';
import { sendTextMessage } from './whatsapp';

// Simple auth middleware
function isAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer') return false;
  return token === env.ADMIN_PASSWORD;
}

export async function handleAdmin(
  request: Request,
  env: Env
): Promise<Response> {
  if (!isAuthorized(request, env)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace('/admin', '');

  // GET /admin/subscribers
  if (request.method === 'GET' && path === '/subscribers') {
    const { results } = await env.DB.prepare(
      `SELECT id, name, whatsapp, plan, status, routes, cities, expires_at, created_at
       FROM subscribers ORDER BY created_at DESC LIMIT 100`
    ).all();
    return json(results);
  }

  // GET /admin/pending-payments
  if (request.method === 'GET' && path === '/pending-payments') {
    const { results } = await env.DB.prepare(
      `SELECT p.*, s.name, s.whatsapp FROM payments p
       JOIN subscribers s ON s.id = p.subscriber_id
       WHERE p.status = 'pending' ORDER BY p.submitted_at DESC`
    ).all();
    return json(results);
  }

  // POST /admin/confirm-payment  { paymentId: number }
  if (request.method === 'POST' && path === '/confirm-payment') {
    const body = await request.json() as { paymentId: number };
    const result = await confirmPayment(env, body.paymentId);
    return json(result);
  }

  // POST /admin/reject-payment  { paymentId: number, reason: string }
  if (request.method === 'POST' && path === '/reject-payment') {
    const body = await request.json() as { paymentId: number; reason: string };
    await env.DB.prepare(
      `UPDATE payments SET status = 'rejected' WHERE id = ?`
    ).bind(body.paymentId).run();

    // Get subscriber WhatsApp to notify them
    const payment = await env.DB.prepare(
      `SELECT p.*, s.whatsapp FROM payments p JOIN subscribers s ON s.id = p.subscriber_id WHERE p.id = ?`
    ).bind(body.paymentId).first<any>();

    if (payment) {
      await sendTextMessage(env, payment.whatsapp,
        `❌ *VFS Alert PK — Payment Issue*\n\n` +
        `We could not verify your JazzCash payment.\n` +
        `Reason: ${body.reason || 'Could not verify transaction'}\n\n` +
        `Please reply with your correct JazzCash transaction reference number or contact support.`
      );
    }
    return json({ success: true });
  }

  // GET /admin/stats
  if (request.method === 'GET' && path === '/stats') {
    const [active, pending, revenue, recentAlerts] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as count FROM subscribers WHERE status = 'active'`).first<{ count: number }>(),
      env.DB.prepare(`SELECT COUNT(*) as count FROM payments WHERE status = 'pending'`).first<{ count: number }>(),
      env.DB.prepare(`SELECT SUM(amount_pkr) as total FROM payments WHERE status = 'confirmed'`).first<{ total: number }>(),
      env.DB.prepare(`SELECT * FROM alert_logs ORDER BY detected_at DESC LIMIT 10`).all(),
    ]);

    return json({
      active_subscribers: active?.count ?? 0,
      pending_payments: pending?.count ?? 0,
      total_revenue_pkr: revenue?.total ?? 0,
      recent_alerts: recentAlerts.results,
    });
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
