export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  SLOT_STATE: KVNamespace;
  MYBROWSER: Fetcher;

  // Secrets
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: string;
  ADMIN_PASSWORD: string;
  JAZZCASH_NUMBER: string;
  ALERT_COOLDOWN_MINUTES: string;
}

export interface Subscriber {
  id: number;
  name: string;
  whatsapp: string;
  plan: 'free' | 'pro' | 'vip';
  status: 'pending' | 'active' | 'expired';
  routes: string[];   // ["pak-gbr","pak-ita"]
  cities: string[];   // ["lahore","islamabad","karachi"]
  expires_at: string | null;
  last_alerted: string | null;
}

export interface SlotResult {
  route: string;
  city: string;
  available: boolean;
  dates: string[];
  checkedAt: string;
}

export interface Payment {
  id: number;
  subscriber_id: number;
  amount_pkr: number;
  jazzcash_ref: string;
  plan: string;
  months: number;
  status: 'pending' | 'confirmed' | 'rejected';
}
