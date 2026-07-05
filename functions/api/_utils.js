/* Ramree — shared helpers for Pages Functions */

export const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

/* Normalize a WhatsApp number to digits only (keeps country code). */
export function normNumber(n) {
  return String(n || "").replace(/\D/g, "");
}

/* Safety-net table creation (schema.sql is the source of truth; this guards
   against a fresh DB where migrations weren't applied). */
export async function ensureTables(env) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT DEFAULT '', price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0,
      images TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS categories (
      slug TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT DEFAULT '',
      hero_image TEXT DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS leads (
      whatsapp_number TEXT PRIMARY KEY, name TEXT NOT NULL, opt_out INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS wishlist (
      id TEXT PRIMARY KEY, whatsapp_number TEXT NOT NULL, product_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, whatsapp_number TEXT NOT NULL, product_id TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1, amount INTEGER NOT NULL, address TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'demo-paid', created_at TEXT NOT NULL)`,
  ];
  for (const s of stmts) {
    try { await env.DB.prepare(s).run(); } catch (e) { /* exists */ }
  }
  // Add columns introduced after first deploy (safe if they already exist).
  try { await env.DB.prepare(`ALTER TABLE orders ADD COLUMN address TEXT DEFAULT ''`).run(); } catch (e) {}
  const productCols = [
    `ALTER TABLE products ADD COLUMN cost INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN colors TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE products ADD COLUMN sizes TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE products ADD COLUMN rating REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0`,
  ];
  for (const s of productCols) { try { await env.DB.prepare(s).run(); } catch (e) {} }
}

export function parseImages(row) {
  const parse = (v) => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  return {
    ...row,
    images: parse(row.images),
    colors: parse(row.colors),
    sizes: parse(row.sizes),
  };
}
