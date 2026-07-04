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
      qty INTEGER NOT NULL DEFAULT 1, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'demo-paid',
      created_at TEXT NOT NULL)`,
  ];
  for (const s of stmts) {
    try { await env.DB.prepare(s).run(); } catch (e) { /* exists */ }
  }
}

export function parseImages(row) {
  let images = [];
  try { images = JSON.parse(row.images || "[]"); } catch (e) { images = []; }
  return { ...row, images };
}
