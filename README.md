# VFS Alert PK

Subscription-based WhatsApp notification service that monitors VFS Global Pakistan appointment slots 24/7 and sends instant WhatsApp alerts when slots open.

## Tech Stack

- **Worker**: Cloudflare Workers (TypeScript) — scraper, API, cron scheduler
- **Website**: Cloudflare Pages — marketing site + subscription form
- **Browser**: Cloudflare Browser Rendering + Playwright
- **Database**: Cloudflare D1 (SQLite)
- **State**: Cloudflare KV
- **Alerts**: WhatsApp Business API (Meta Cloud)
- **Payments**: JazzCash (manual confirmation MVP)

## Quick Start

### 1. Cloudflare Setup

```bash
npm install -g wrangler
wrangler login

# Create D1 database
wrangler d1 create vfs-alert-db
# Copy database_id into worker/wrangler.toml

# Create KV namespace
wrangler kv:namespace create SLOT_STATE
# Copy id into worker/wrangler.toml

# Install worker dependencies
cd worker && npm install

# Init database schema
wrangler d1 execute vfs-alert-db --file=../schema.sql
```

### 2. Set Secrets

```bash
wrangler secret put WHATSAPP_ACCESS_TOKEN
wrangler secret put WHATSAPP_PHONE_NUMBER_ID
wrangler secret put WHATSAPP_WEBHOOK_VERIFY_TOKEN
wrangler secret put ADMIN_PASSWORD
wrangler secret put JAZZCASH_NUMBER        # value: 03318627018
wrangler secret put ALERT_COOLDOWN_MINUTES # value: 10
```

### 3. WhatsApp Business API

1. Create Meta App at developers.facebook.com (Business type)
2. Add WhatsApp product
3. Register message templates from `docs/whatsapp-templates.md`
4. Set webhook URL: `https://vfs-alert-pk.YOUR_SUBDOMAIN.workers.dev/webhook`

### 4. Deploy

```bash
# Deploy Worker
cd worker && wrangler deploy

# Deploy website
wrangler pages deploy ../website/ --project-name=vfs-alert-pk
```

### 5. GitHub Actions (CI/CD)

Add these secrets to GitHub repo settings:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Pushes to `main` auto-deploy both Worker and Pages.

## Admin API

All admin routes require `Authorization: Bearer <ADMIN_PASSWORD>` header.

```bash
# Stats
curl -H "Authorization: Bearer PASSWORD" https://YOUR_WORKER/admin/stats

# Pending payments
curl -H "Authorization: Bearer PASSWORD" https://YOUR_WORKER/admin/pending-payments

# Confirm payment
curl -X POST -H "Authorization: Bearer PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"paymentId":1}' \
  https://YOUR_WORKER/admin/confirm-payment

# Reject payment
curl -X POST -H "Authorization: Bearer PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"paymentId":1,"reason":"Transaction not found"}' \
  https://YOUR_WORKER/admin/reject-payment
```

## Public API

```bash
# Available routes
GET /api/routes

# Live slot status
GET /api/status

# New subscription
POST /api/subscribe
Content-Type: application/json
{"name":"Ahmed","whatsapp":"03001234567","plan":"pro","routes":["pak-gbr"],"cities":["lahore"],"jazzcash_ref":"T123","months":1}
```

## Pricing

| Plan | Price | Routes | Monitoring |
|------|-------|--------|------------|
| Free | Rs. 0 (7 days) | UK only | 15 min |
| Pro  | Rs. 1,500/mo | All 7 | 1 min |
| VIP  | Rs. 3,000/mo | All 7 | 30 sec |

## Security Notes

- Never commit secrets — use `wrangler secret put` only
- Admin password must be strong (20+ random characters)
- Rate limit `/api/subscribe` via Cloudflare rules to prevent spam

---

*VFS Alert PK — Not affiliated with VFS Global or any government body.*
