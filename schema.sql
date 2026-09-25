-- Subscribers table
CREATE TABLE IF NOT EXISTS subscribers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  whatsapp    TEXT NOT NULL UNIQUE,  -- e.g. 923001234567 (no +, no dashes)
  plan        TEXT NOT NULL DEFAULT 'pro',  -- 'free' | 'pro' | 'vip'
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'active' | 'expired'
  routes      TEXT NOT NULL DEFAULT '[]',  -- JSON array: ["pak-gbr","pak-ita"]
  cities      TEXT NOT NULL DEFAULT '[]',  -- JSON array: ["lahore","islamabad","karachi"]
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT,
  last_alerted TEXT
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subscriber_id   INTEGER REFERENCES subscribers(id),
  amount_pkr      INTEGER NOT NULL,
  jazzcash_ref    TEXT,          -- Transaction ID from JazzCash
  plan            TEXT NOT NULL,
  months          INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'confirmed' | 'rejected'
  submitted_at    TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at    TEXT,
  notes           TEXT
);

-- Alert logs
CREATE TABLE IF NOT EXISTS alert_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  route         TEXT NOT NULL,   -- e.g. "pak-gbr"
  city          TEXT NOT NULL,   -- e.g. "lahore"
  dates_found   TEXT NOT NULL,   -- JSON: ["2026-10-05","2026-10-11"]
  alerted_count INTEGER NOT NULL DEFAULT 0,
  detected_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- VFS routes config
CREATE TABLE IF NOT EXISTS routes (
  code        TEXT PRIMARY KEY,   -- e.g. "pak-gbr"
  label       TEXT NOT NULL,      -- e.g. "Pakistan → UK"
  url_segment TEXT NOT NULL,      -- e.g. "gbr"
  active      INTEGER NOT NULL DEFAULT 1
);

-- Seed routes
INSERT OR IGNORE INTO routes VALUES ('pak-gbr', 'Pakistan → UK', 'gbr', 1);
INSERT OR IGNORE INTO routes VALUES ('pak-ita', 'Pakistan → Italy', 'ita', 1);
INSERT OR IGNORE INTO routes VALUES ('pak-fra', 'Pakistan → France', 'fra', 1);
INSERT OR IGNORE INTO routes VALUES ('pak-deu', 'Pakistan → Germany', 'deu', 1);
INSERT OR IGNORE INTO routes VALUES ('pak-can', 'Pakistan → Canada', 'can', 1);
INSERT OR IGNORE INTO routes VALUES ('pak-aus', 'Pakistan → Australia', 'aus', 1);
INSERT OR IGNORE INTO routes VALUES ('pak-nld', 'Pakistan → Netherlands', 'nld', 1);
