import type { Env, Subscriber } from './types';

const WA_API_URL = 'https://graph.facebook.com/v20.0';

// Send a pre-approved template message
export async function sendSlotAlert(
  env: Env,
  subscriber: Subscriber,
  route: string,
  routeLabel: string,
  city: string,
  dates: string[]
): Promise<boolean> {
  const cityLabel = city.charAt(0).toUpperCase() + city.slice(1);
  const datesText =
    dates.length > 0 ? dates.slice(0, 5).join(', ') : 'Multiple dates';

  // Template: "vfs_slot_alert" — register this template in Meta Business Manager
  // Template body example:
  //   "🚨 SLOT OPEN: {{1}} Visa ({{2}} centre)
  //    📅 Available: {{3}}
  //    ⏰ Act NOW — slots last 30–90 seconds
  //    🔗 Book: https://visa.vfsglobal.com/pak/en/{{4}}/book-an-appointment"
  const payload = {
    messaging_product: 'whatsapp',
    to: subscriber.whatsapp,
    type: 'template',
    template: {
      name: 'vfs_slot_alert',
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: routeLabel },
            { type: 'text', text: cityLabel },
            { type: 'text', text: datesText },
            { type: 'text', text: route.split('-')[1] }, // url segment e.g. "gbr"
          ],
        },
      ],
    },
  };

  const res = await fetch(
    `${WA_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('WhatsApp send failed:', err);
    return false;
  }

  return true;
}

// Send a plain text message (for admin/support use)
export async function sendTextMessage(
  env: Env,
  to: string,
  text: string
): Promise<boolean> {
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };

  const res = await fetch(
    `${WA_API_URL}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  return res.ok;
}

// Send payment confirmation message to new subscriber
export async function sendWelcomeMessage(
  env: Env,
  subscriber: Subscriber,
  expiresAt: string
): Promise<void> {
  const routeLabels = subscriber.routes.join(', ');
  const text =
    `✅ *VFS Alert PK — Subscription Activated*\n\n` +
    `Welcome, ${subscriber.name}!\n\n` +
    `📋 *Your plan:* ${subscriber.plan.toUpperCase()}\n` +
    `🛂 *Routes:* ${routeLabels}\n` +
    `🏙 *Cities:* ${subscriber.cities.join(', ')}\n` +
    `📅 *Valid until:* ${expiresAt}\n\n` +
    `You will receive instant WhatsApp alerts the moment a VFS slot opens for your routes.\n\n` +
    `ℹ️ Slots disappear in 30–90 seconds — keep your VFS login ready!\n\n` +
    `Support: Reply to this message anytime.`;

  await sendTextMessage(env, subscriber.whatsapp, text);
}

// Handle incoming WhatsApp messages (webhooks)
export async function handleIncomingMessage(
  env: Env,
  from: string,
  text: string
): Promise<void> {
  const lower = text.toLowerCase().trim();

  // Simple keyword responses
  if (lower === 'stop' || lower === 'unsubscribe') {
    await env.DB.prepare(
      `UPDATE subscribers SET status = 'expired' WHERE whatsapp = ?`
    ).bind(from).run();
    await sendTextMessage(env, from, '✅ You have been unsubscribed. Reply START to re-subscribe.');
    return;
  }

  if (lower === 'status') {
    const sub = await env.DB.prepare(
      `SELECT * FROM subscribers WHERE whatsapp = ?`
    ).bind(from).first<any>();
    if (sub) {
      await sendTextMessage(
        env, from,
        `📊 *Your subscription status*\nPlan: ${sub.plan}\nStatus: ${sub.status}\nExpires: ${sub.expires_at || 'N/A'}`
      );
    } else {
      await sendTextMessage(env, from, '❌ No subscription found. Visit vfsalert.pk to subscribe.');
    }
    return;
  }

  // Default response
  await sendTextMessage(
    env, from,
    `🤖 VFS Alert PK Bot\n\nCommands:\n• *status* — check your subscription\n• *stop* — unsubscribe\n\nWebsite: vfsalert.pk`
  );
}
