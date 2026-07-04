/* POST /api/lead  { name, whatsapp_number }
   Upserts a lead keyed by WhatsApp number. Preserves existing opt_out flag. */
import { json, preflight, ensureTables, normNumber } from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.DB) return json({ error: "D1 not configured" }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }

  const name = String(body.name || "").trim().slice(0, 80);
  const num = normNumber(body.whatsapp_number);
  if (!name) return json({ error: "Name required" }, 400);
  if (num.length < 8) return json({ error: "Valid WhatsApp number required" }, 400);

  await ensureTables(env);
  const now = new Date().toISOString();

  try {
    // Upsert: keep opt_out on conflict, refresh name + updated_at.
    await env.DB.prepare(
      `INSERT INTO leads (whatsapp_number, name, opt_out, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(whatsapp_number) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`
    ).bind(num, name, now, now).run();

    const row = await env.DB.prepare("SELECT opt_out FROM leads WHERE whatsapp_number = ?").bind(num).first();
    return json({ ok: true, whatsapp_number: num, opt_out: row ? row.opt_out : 0 });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
