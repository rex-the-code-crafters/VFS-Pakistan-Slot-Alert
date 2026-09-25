import type { Env, Subscriber } from './types';
import { sendWelcomeMessage, sendTextMessage } from './whatsapp';

// Plan pricing (PKR)
export const PLANS = {
  free: { name: 'Free (Trial)', pkr_per_month: 0, max_routes: 1 },
  pro:  { name: 'Pro Alert',   pkr_per_month: 1500, max_routes: 5 },
  vip:  { name: 'VIP Auto-Alert', pkr_per_month: 3000, max_routes: 10 },
};

// Submit a new subscription request
export async function submitSubscription(env: Env, data: {
  name: string;
  whatsapp: string;
  plan: string;
  routes: string[];
  cities: string[];
  jazzcash_ref: string;
  months: number;
}): Promise<{ success: boolean; message: string; id?: number }> {
  const plan = PLANS[data.plan as keyof typeof PLANS];
  if (!plan) return { success: false, message: 'Invalid plan' };

  const amount = plan.pkr_per_month * data.months;

  // Normalise WhatsApp number (ensure it starts with 92 for Pakistan)
  let wa = data.whatsapp.replace(/\D/g, '');
  if (wa.startsWith('0')) wa = '92' + wa.slice(1);
  if (!wa.startsWith('92')) wa = '92' + wa;

  // Check if subscriber already exists
  const existing = await env.DB.prepare(
    `SELECT id FROM subscribers WHERE whatsapp = ?`
  ).bind(wa).first<{ id: number }>();

  let subscriberId: number;

  if (existing) {
    subscriberId = existing.id;
  } else {
    // Create subscriber (pending until payment confirmed)
    const result = await env.DB.prepare(`
      INSERT INTO subscribers (name, whatsapp, plan, status, routes, cities)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).bind(
      data.name, wa, data.plan,
      JSON.stringify(data.routes),
      JSON.stringify(data.cities)
    ).run();

    subscriberId = result.meta.last_row_id as number;
  }

  // Record payment submission
  await env.DB.prepare(`
    INSERT INTO payments (subscriber_id, amount_pkr, jazzcash_ref, plan, months, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).bind(subscriberId, amount, data.jazzcash_ref, data.plan, data.months).run();

  // Send WhatsApp confirmation to subscriber
  await sendTextMessage(env, wa,
    `✅ *VFS Alert PK — Payment Received*\n\n` +
    `Thank you, ${data.name}!\n\n` +
    `📋 Plan: ${plan.name}\n` +
    `💰 Amount: Rs. ${amount}\n` +
    `🧾 JazzCash Ref: ${data.jazzcash_ref}\n\n` +
    `⏳ Your subscription will be activated within 2 hours after payment verification.\n\n` +
    `Questions? Reply to this message.`
  );

  // Notify admin
  const adminWa = env.JAZZCASH_NUMBER.replace(/\D/g, '');
  const adminWaFull = adminWa.startsWith('0') ? '92' + adminWa.slice(1) : adminWa;
  await sendTextMessage(env, adminWaFull,
    `🔔 *NEW PAYMENT SUBMISSION*\n\n` +
    `Name: ${data.name}\n` +
    `WhatsApp: ${wa}\n` +
    `Plan: ${data.plan} × ${data.months} month(s)\n` +
    `Amount: Rs. ${amount}\n` +
    `JazzCash Ref: ${data.jazzcash_ref}\n\n` +
    `To confirm: POST /admin/confirm-payment\n` +
    `Subscriber ID: ${subscriberId}`
  );

  return { success: true, message: 'Payment submitted. Activation within 2 hours.', id: subscriberId };
}

// Admin confirms payment and activates subscription
export async function confirmPayment(
  env: Env,
  paymentId: number
): Promise<{ success: boolean; message: string }> {
  const payment = await env.DB.prepare(
    `SELECT p.*, s.whatsapp, s.name, s.plan FROM payments p JOIN subscribers s ON s.id = p.subscriber_id WHERE p.id = ?`
  ).bind(paymentId).first<any>();

  if (!payment) return { success: false, message: 'Payment not found' };
  if (payment.status === 'confirmed') return { success: false, message: 'Already confirmed' };

  // Calculate expiry
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + payment.months);
  const expiresStr = expiresAt.toISOString().split('T')[0];

  // Activate subscriber
  await env.DB.prepare(`
    UPDATE subscribers
    SET status = 'active', plan = ?, expires_at = ?
    WHERE id = ?
  `).bind(payment.plan, expiresStr, payment.subscriber_id).run();

  // Mark payment confirmed
  await env.DB.prepare(`
    UPDATE payments SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?
  `).bind(paymentId).run();

  // Get full subscriber data for welcome message
  const sub = await env.DB.prepare(
    `SELECT * FROM subscribers WHERE id = ?`
  ).bind(payment.subscriber_id).first<any>();

  if (sub) {
    const subscriber: Subscriber = {
      ...sub,
      routes: JSON.parse(sub.routes || '[]'),
      cities: JSON.parse(sub.cities || '[]'),
    };
    await sendWelcomeMessage(env, subscriber, expiresStr);
  }

  return { success: true, message: `Subscription activated until ${expiresStr}` };
}
