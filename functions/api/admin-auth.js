/* POST /api/admin-auth  { action, ... }
   Actions: bootstrap | login | logout | me | forgot | change-password */
import { json, preflight, ensureTables } from "./_utils.js";
import {
  ensureAuthTables, hashPassword, verifyPassword, createSession, destroySession,
  getAdminByToken, tokenFromRequest, recoveryCode, sha256hex, timingSafeEqual,
} from "./_auth.js";

function normUser(u) { return String(u || "").trim().toLowerCase().slice(0, 40); }

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.DB) return json({ error: "D1 not configured" }, 500);

  await ensureTables(env);
  await ensureAuthTables(env);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }
  const action = body.action;

  try {
    /* Create the first OWNER account. Requires the ADMIN_KEY secret and only
       works while no owner exists (one-time setup). */
    if (action === "bootstrap") {
      if (!env.ADMIN_KEY || body.key !== env.ADMIN_KEY) return json({ error: "Setup key incorrect" }, 401);
      const existing = await env.DB.prepare("SELECT id FROM admins WHERE role='owner' LIMIT 1").first();
      if (existing) return json({ error: "Owner already exists. Use login or Forgot password." }, 409);

      const username = normUser(body.username);
      const password = String(body.password || "");
      const phone = String(body.phone || "").replace(/\D/g, "");
      if (username.length < 3) return json({ error: "Username must be 3+ characters" }, 400);
      if (password.length < 6) return json({ error: "Password must be 6+ characters" }, 400);

      const { hash, salt } = await hashPassword(password);
      const code = recoveryCode();
      const recovery_hash = await sha256hex(code);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO admins (id, username, phone, pass_hash, pass_salt, recovery_hash, role, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'owner', 1, ?)`
      ).bind(id, username, phone, hash, salt, recovery_hash, new Date().toISOString()).run();
      const token = await createSession(env, id);
      return json({ ok: true, token, admin: { username, role: "owner" }, recovery_code: code });
    }

    if (action === "login") {
      const username = normUser(body.username);
      const password = String(body.password || "");
      const row = await env.DB.prepare("SELECT * FROM admins WHERE username = ?").bind(username).first();
      if (!row || !row.active) return json({ error: "Invalid username or password" }, 401);
      const ok = await verifyPassword(password, row.pass_hash, row.pass_salt);
      if (!ok) return json({ error: "Invalid username or password" }, 401);
      const token = await createSession(env, row.id);
      return json({ ok: true, token, admin: { username: row.username, role: row.role, phone: row.phone } });
    }

    if (action === "me") {
      const admin = await getAdminByToken(env, tokenFromRequest(request, body));
      if (!admin) return json({ error: "Not signed in" }, 401);
      return json({ ok: true, admin });
    }

    if (action === "logout") {
      await destroySession(env, tokenFromRequest(request, body));
      return json({ ok: true });
    }

    if (action === "change-password") {
      const admin = await getAdminByToken(env, tokenFromRequest(request, body));
      if (!admin) return json({ error: "Not signed in" }, 401);
      const row = await env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(admin.id).first();
      const ok = await verifyPassword(String(body.old_password || ""), row.pass_hash, row.pass_salt);
      if (!ok) return json({ error: "Current password is incorrect" }, 401);
      const np = String(body.new_password || "");
      if (np.length < 6) return json({ error: "New password must be 6+ characters" }, 400);
      const { hash, salt } = await hashPassword(np);
      await env.DB.prepare("UPDATE admins SET pass_hash=?, pass_salt=? WHERE id=?").bind(hash, salt, admin.id).run();
      return json({ ok: true });
    }

    /* Forgot password — reset using the recovery code (phone-OTP can be added
       later once an SMS provider is configured). */
    if (action === "forgot") {
      const username = normUser(body.username);
      const code = String(body.recovery_code || "").trim().toUpperCase();
      const np = String(body.new_password || "");
      if (np.length < 6) return json({ error: "New password must be 6+ characters" }, 400);
      const row = await env.DB.prepare("SELECT * FROM admins WHERE username = ?").bind(username).first();
      if (!row) return json({ error: "No such admin" }, 404);
      const codeHash = await sha256hex(code);
      if (!row.recovery_hash || !timingSafeEqual(codeHash, row.recovery_hash)) {
        return json({ error: "Recovery code is incorrect" }, 401);
      }
      const { hash, salt } = await hashPassword(np);
      // Rotate the recovery code after use.
      const newCode = recoveryCode();
      const newRecoveryHash = await sha256hex(newCode);
      await env.DB.prepare("UPDATE admins SET pass_hash=?, pass_salt=?, recovery_hash=? WHERE id=?")
        .bind(hash, salt, newRecoveryHash, row.id).run();
      return json({ ok: true, recovery_code: newCode });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
