/* POST /api/wishlist  { whatsapp_number, product_id } */
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
  if (num.length < 8 || !productId) return json({ error: "Missing fields" }, 400);

  await ensureTables(env);

  try {
    // Avoid duplicate wishlist rows for the same number+product.
    const existing = await env.DB
      .prepare("SELECT id FROM wishlist WHERE whatsapp_number = ? AND product_id = ?")
      .bind(num, productId).first();
    if (existing) return json({ ok: true, id: existing.id, already: true });

    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO wishlist (id, whatsapp_number, product_id, created_at) VALUES (?, ?, ?, ?)"
    ).bind(id, num, productId, new Date().toISOString()).run();
    return json({ ok: true, id });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
