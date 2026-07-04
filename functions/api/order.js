/* POST /api/order  { whatsapp_number, product_id, qty, amount }
   Demo checkout: creates an order row and decrements stock atomically-ish. */
import { json, preflight, ensureTables, normNumber } from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.DB) return json({ error: "D1 not configured" }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }

  const num = normNumber(body.whatsapp_number);
  const productId = String(body.product_id || "");
  const qty = Math.max(1, parseInt(body.qty, 10) || 1);
  if (num.length < 8 || !productId) return json({ error: "Missing fields" }, 400);

  await ensureTables(env);

  try {
    const product = await env.DB.prepare("SELECT price, stock FROM products WHERE id = ?").bind(productId).first();
    if (!product) return json({ error: "Product not found" }, 404);
    if (product.stock < qty) return json({ error: "Not enough stock", stock: product.stock }, 409);

    const amount = Number.isFinite(body.amount) ? body.amount : product.price * qty;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Decrement stock guarding against going negative.
    const upd = await env.DB
      .prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?")
      .bind(qty, productId, qty).run();
    if (!upd.meta || upd.meta.changes === 0) {
      const fresh = await env.DB.prepare("SELECT stock FROM products WHERE id = ?").bind(productId).first();
      return json({ error: "Stock changed, please retry", stock: fresh ? fresh.stock : 0 }, 409);
    }

    await env.DB.prepare(
      "INSERT INTO orders (id, whatsapp_number, product_id, qty, amount, status, created_at) VALUES (?, ?, ?, ?, ?, 'demo-paid', ?)"
    ).bind(id, num, productId, qty, amount, now).run();

    const newStock = product.stock - qty;
    return json({ ok: true, order_id: id, stock: newStock });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
