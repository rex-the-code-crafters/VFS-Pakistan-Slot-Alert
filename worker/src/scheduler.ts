import type { Env, SlotResult, Subscriber } from './types';
import { checkSlot, MONITOR_ROUTES } from './scraper';
import { sendSlotAlert } from './whatsapp';

const ROUTE_LABELS: Record<string, string> = {
  'pak-gbr': 'Pakistan → UK',
  'pak-ita': 'Pakistan → Italy',
  'pak-fra': 'Pakistan → France',
  'pak-deu': 'Pakistan → Germany',
  'pak-can': 'Pakistan → Canada',
  'pak-aus': 'Pakistan → Australia',
  'pak-nld': 'Pakistan → Netherlands',
};

const CITIES = ['lahore', 'islamabad', 'karachi'];

export async function runScheduledCheck(env: Env): Promise<void> {
  console.log('Cron triggered at', new Date().toISOString());

  // Stagger checks to avoid hammering VFS all at once
  // Check 2–3 routes per cron execution (rotate through all routes over time)
  const routeIndex = Math.floor(Date.now() / 60_000) % MONITOR_ROUTES.length;
  const route = MONITOR_ROUTES[routeIndex];
  const cityIndex = Math.floor(Date.now() / 60_000 / MONITOR_ROUTES.length) % CITIES.length;
  const city = CITIES[cityIndex];

  await checkAndAlert(env, route.route, route.segment, city);
}

async function checkAndAlert(
  env: Env,
  routeCode: string,
  segment: string,
  city: string
): Promise<void> {
  const stateKey = `slot:${routeCode}:${city}`;
  const cooldownMinutes = parseInt(env.ALERT_COOLDOWN_MINUTES || '10');

  // Check VFS
  const result: SlotResult = await checkSlot(env, routeCode, segment, city);
  console.log(`[${routeCode}/${city}] Available: ${result.available}`);

  if (!result.available) {
    // Update state: no slot
    await env.SLOT_STATE.put(stateKey, JSON.stringify({ available: false, ts: Date.now() }), {
      expirationTtl: 3600,
    });
    return;
  }

  // Slot found! Check if we already alerted recently (cooldown)
  const lastState = await env.SLOT_STATE.get(stateKey);
  if (lastState) {
    const parsed = JSON.parse(lastState);
    if (parsed.available && Date.now() - parsed.ts < cooldownMinutes * 60_000) {
      console.log(`[${routeCode}/${city}] Slot still open but cooldown active — skipping alert`);
      return;
    }
  }

  // NEW slot detected — alert subscribers!
  console.log(`[${routeCode}/${city}] NEW SLOT DETECTED — sending alerts`);

  // Get all active subscribers for this route and city
  const { results: subscribers } = await env.DB.prepare(`
    SELECT * FROM subscribers
    WHERE status = 'active'
    AND routes LIKE ?
    AND (cities = '["all"]' OR cities LIKE ?)
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).bind(`%${routeCode}%`, `%${city}%`).all<any>();

  console.log(`Alerting ${subscribers.length} subscribers`);

  let alertedCount = 0;
  const routeLabel = ROUTE_LABELS[routeCode] || routeCode;

  for (const sub of subscribers) {
    // Parse JSON fields stored as strings
    const subscriber: Subscriber = {
      ...sub,
      routes: JSON.parse(sub.routes || '[]'),
      cities: JSON.parse(sub.cities || '[]'),
    };

    const sent = await sendSlotAlert(
      env, subscriber, routeCode, routeLabel, city, result.dates
    );
    if (sent) alertedCount++;

    // Small delay between messages to respect WhatsApp rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  // Update state with "slot available + last alerted time"
  await env.SLOT_STATE.put(
    stateKey,
    JSON.stringify({ available: true, ts: Date.now(), alertedCount }),
    { expirationTtl: 3600 }
  );

  // Log to database
  await env.DB.prepare(`
    INSERT INTO alert_logs (route, city, dates_found, alerted_count)
    VALUES (?, ?, ?, ?)
  `).bind(routeCode, city, JSON.stringify(result.dates), alertedCount).run();

  console.log(`[${routeCode}/${city}] Alert sent to ${alertedCount} subscribers`);
}
