-- Ramree — Cloudflare D1 schema
-- Apply:  npx wrangler d1 execute ramree-db --remote --file=./schema.sql
-- (use --local instead of --remote for local dev)

-- ── Products ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  category      TEXT NOT NULL,              -- 'korean-tshirts' | 'korean-tops' | 'rayon-kurti-sets'
  name          TEXT NOT NULL,
  description    TEXT DEFAULT '',
  price          INTEGER NOT NULL,          -- in INR, whole rupees
  stock          INTEGER NOT NULL DEFAULT 0,
  images         TEXT NOT NULL DEFAULT '[]',-- JSON array of image URLs (1..n angles)
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- ── Categories (display metadata) ────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  subtitle    TEXT DEFAULT '',
  hero_image  TEXT DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ── Leads / customers (keyed by WhatsApp number) ─────────
CREATE TABLE IF NOT EXISTS leads (
  whatsapp_number TEXT PRIMARY KEY,         -- normalized, digits only w/ country code
  name            TEXT NOT NULL,
  opt_out         INTEGER NOT NULL DEFAULT 0, -- 1 = do not contact
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ── Wishlist ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist (
  id              TEXT PRIMARY KEY,
  whatsapp_number TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wishlist_number ON wishlist(whatsapp_number);

-- ── Orders (demo — no real payment) ──────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  whatsapp_number TEXT NOT NULL,
  product_id      TEXT NOT NULL,
  qty             INTEGER NOT NULL DEFAULT 1,
  amount          INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'demo-paid',
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(whatsapp_number);
