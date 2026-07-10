/* Ramree admin auth helpers — password hashing (PBKDF2), sessions, roles.
   Stored in D1: admins + admin_sessions. */

const enc = new TextEncoder();

export function bytesToHex(b) { return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
export function hexToBytes(h) { const a = new Uint8Array(h.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }

export async function sha256hex(str) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return bytesToHex(d);
}

/* PBKDF2 password hash. Returns { hash, salt } hex strings. */
export async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return { hash: bytesToHex(bits), salt: bytesToHex(salt) };
}
export async function verifyPassword(password, hashHex, saltHex) {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, hashHex);
}
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function randomToken() { return bytesToHex(crypto.getRandomValues(new Uint8Array(32))); }
export function recoveryCode() {
  const seg = () => bytesToHex(crypto.getRandomValues(new Uint8Array(2))).toUpperCase();
  return `RAMREE-${seg()}-${seg()}`;
}

export async function ensureAuthTables(env) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, phone TEXT DEFAULT '',
      pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL,
      recovery_hash TEXT DEFAULT '', role TEXT NOT NULL DEFAULT 'staff',
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  ];
  for (const s of stmts) { try { await env.DB.prepare(s).run(); } catch (e) {} }
}

const SESSION_DAYS = 7;

export async function createSession(env, adminId) {
  const token = randomToken();
  const th = await sha256hex(token);
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_DAYS * 864e5);
  await env.DB.prepare("INSERT INTO admin_sessions (token_hash, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(th, adminId, now.toISOString(), exp.toISOString()).run();
  return token;
}

export async function destroySession(env, token) {
  if (!token) return;
  const th = await sha256hex(token);
  try { await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(th).run(); } catch (e) {}
}

/* Returns the admin row for a valid session token, or null. */
export async function getAdminByToken(env, token) {
  if (!token) return null;
  const th = await sha256hex(token);
  const sess = await env.DB.prepare("SELECT admin_id, expires_at FROM admin_sessions WHERE token_hash = ?").bind(th).first();
  if (!sess) return null;
  if (new Date(sess.expires_at) < new Date()) {
    try { await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(th).run(); } catch (e) {}
    return null;
  }
  const admin = await env.DB.prepare("SELECT id, username, phone, role, active FROM admins WHERE id = ?").bind(sess.admin_id).first();
  if (!admin || !admin.active) return null;
  return admin;
}

export function tokenFromRequest(request, body) {
  const h = request.headers.get("Authorization") || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return (body && body.token) || "";
}
