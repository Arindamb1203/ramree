/* POST /api/optout  { whatsapp_number, opt_out: 0|1 }
   Stores the do-not-contact preference against a WhatsApp number. */
import { json, preflight, ensureTables, normNumber } from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.DB) return json({ error: "D1 not configured" }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }

  const num = normNumber(body.whatsapp_number);
  const optOut = body.opt_out ? 1 : 0;
  if (num.length < 8) return json({ error: "Valid WhatsApp number required" }, 400);

  await ensureTables(env);
  const now = new Date().toISOString();

  try {
    // Upsert so opt-out works even if the lead row doesn't exist yet.
    await env.DB.prepare(
      `INSERT INTO leads (whatsapp_number, name, opt_out, created_at, updated_at)
       VALUES (?, '', ?, ?, ?)
       ON CONFLICT(whatsapp_number) DO UPDATE SET opt_out = excluded.opt_out, updated_at = excluded.updated_at`
    ).bind(num, optOut, now, now).run();
    return json({ ok: true, opt_out: optOut });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
