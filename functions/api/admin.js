/* POST /api/admin  { action, ... }  — token-authenticated (Bearer or body.token)
   Actions:
     list | product-get | product-save | product-delete | product-images
     hero | hero-save | compose | accounts | dashboard | analytics
     staff-create | staff-list | staff-set-active
*/
import { json, preflight, ensureTables, parseImages } from "./_utils.js";
import { getModel, getQuality, imageGenerate, imageEdit, dataUrlToBytes, dataUrlToBlob, urlToBlob } from "./_openai.js";
import { ensureAuthTables, getAdminByToken, tokenFromRequest, hashPassword, recoveryCode, sha256hex } from "./_auth.js";

const HERO_PROMPT = "A serene, premium travel photograph of Kurseong hill town in the Darjeeling Himalayas at misty dawn: layered emerald tea gardens on rolling ridges, pine forests, low drifting clouds, distant snow-capped Kanchenjunga glowing with soft golden sunrise light, muted sage-green and warm gold tones, tranquil and luxurious, no people, no text, no watermark";

async function putImage(env, key, dataUrl) {
  const { bytes, contentType } = dataUrlToBytes(dataUrl);
  await env.MEDIA_KV.put(key, bytes, { metadata: { contentType } });
  return `/media/${key}`;
}
const jarr = (v) => JSON.stringify(Array.isArray(v) ? v : []);
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/* Demo figures — the shop is pre-launch, so the orders table is empty and the
   owner console would show all zeros. Until a product has REAL sales, we show
   stable, believable demo numbers derived from its id (deterministic, so they
   don't jump around on refresh). Real orders override these automatically. */
function hashId(s) { let h = 2166136261; s = String(s || ""); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function demoStats(id) {
  const h = hashId(id);
  const sold_all = h % 55;                                   // 0..54 lifetime units
  const sold_win = Math.round(sold_all * (((h >>> 9) % 60) / 100)); // recent slice, 0..~60%
  return { sold_all, sold_win };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.DB) return json({ error: "D1 not configured" }, 500);

  await ensureTables(env);
  await ensureAuthTables(env);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }

  const admin = await getAdminByToken(env, tokenFromRequest(request, body));
  if (!admin) return json({ error: "Not signed in" }, 401);
  const isOwner = admin.role === "owner";

  try {
    /* ── Products ───────────────────────────────────── */
    if (body.action === "list") {
      const { results } = await env.DB.prepare("SELECT * FROM products ORDER BY category, name").all();
      return json({ products: (results || []).map(parseImages) });
    }

    if (body.action === "product-get") {
      const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(String(body.id || "")).first();
      if (!row) return json({ error: "Not found" }, 404);
      return json({ product: parseImages(row) });
    }

    if (body.action === "product-save") {
      const p = body.product || {};
      const name = String(p.name || "").trim();
      const category = String(p.category || "").trim();
      if (!name) return json({ error: "Name is required" }, 400);
      if (!category) return json({ error: "Category is required" }, 400);

      const price = Math.max(0, parseInt(p.price, 10) || 0);
      const cost = Math.max(0, parseInt(p.cost, 10) || 0);
      const stock = Math.max(0, parseInt(p.stock, 10) || 0);
      const colors = Array.isArray(p.colors) ? p.colors : [];
      const sizes = Array.isArray(p.sizes) ? p.sizes : [];
      const description = String(p.description || "").slice(0, 1000);

      let id = String(p.id || "").trim();
      if (id) {
        const exists = await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
        if (!exists) return json({ error: "Product not found" }, 404);
        await env.DB.prepare(
          `UPDATE products SET category=?, name=?, description=?, price=?, cost=?, stock=?, colors=?, sizes=? WHERE id=?`
        ).bind(category, name, description, price, cost, stock, jarr(colors), jarr(sizes), id).run();
        return json({ ok: true, id });
      }
      // create
      id = slug(name) + "-" + Math.random().toString(36).slice(2, 6);
      await env.DB.prepare(
        `INSERT INTO products (id, category, name, description, price, cost, stock, colors, sizes, rating, review_count, images, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '[]', ?)`
      ).bind(id, category, name, description, price, cost, stock, jarr(colors), jarr(sizes), new Date().toISOString()).run();
      return json({ ok: true, id });
    }

    if (body.action === "product-delete") {
      const id = String(body.id || "");
      await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }

    if (body.action === "product-images") {
      const id = String(body.product_id || "");
      const images = Array.isArray(body.images) ? body.images.slice(0, 12) : [];
      if (!id) return json({ error: "product_id required" }, 400);
      if (!images.length) return json({ error: "No images provided" }, 400);
      const exists = await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
      if (!exists) return json({ error: "Product not found" }, 404);
      const urls = [];
      for (let i = 0; i < images.length; i++) {
        const img = String(images[i] || "");
        // New capture/upload → data: URL we store in KV. Reused existing photo →
        // already a /media or http URL; reference it directly (no duplicate storage).
        if (img.startsWith("data:")) urls.push(await putImage(env, `photo/${id}/${Date.now()}-${i + 1}`, img));
        else if (img.startsWith("/") || img.startsWith("http")) urls.push(img);
      }
      if (!urls.length) return json({ error: "No usable images" }, 400);
      await env.DB.prepare("UPDATE products SET images = ? WHERE id = ?").bind(JSON.stringify(urls), id).run();
      return json({ ok: true, images: urls });
    }

    if (body.action === "hero") {
      // Generate only, return the PNG to the client; the client downscales &
      // re-encodes to JPEG (Workers have no canvas) then calls hero-save. This
      // keeps the stored hero small (~300 KB JPEG vs ~2 MB PNG).
      if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not set" }, 500);
      const imgs = await imageGenerate({ apiKey: env.OPENAI_API_KEY, model: getModel(env), prompt: HERO_PROMPT, size: "1536x1024", quality: env.OPENAI_HERO_QUALITY || "medium", n: 1 });
      if (!imgs[0]) return json({ error: "Hero generation failed" }, 502);
      return json({ ok: true, image: imgs[0] });
    }

    if (body.action === "hero-save") {
      const image = String(body.image || "");
      if (!image.startsWith("data:")) return json({ error: "image (data URL) required" }, 400);
      const url = await putImage(env, "hero/1", image);
      return json({ ok: true, url });
    }

    /* ── Accounts / P&L ─────────────────────────────── */
    if (body.action === "accounts") {
      const from = body.from ? String(body.from) : "0000";
      const to = body.to ? String(body.to) + "T23:59:59Z" : "9999";
      const { results } = await env.DB.prepare(
        `SELECT o.product_id, o.qty, o.amount, o.created_at, p.name AS pname, p.cost AS pcost
         FROM orders o LEFT JOIN products p ON p.id = o.product_id
         WHERE o.created_at >= ? AND o.created_at <= ? ORDER BY o.created_at DESC`
      ).bind(from, to).all();
      const rows = results || [];
      let revenue = 0, cogs = 0, units = 0;
      const byProduct = {};
      for (const r of rows) {
        const rev = r.amount || 0;
        const c = (r.pcost || 0) * (r.qty || 0);
        revenue += rev; cogs += c; units += r.qty || 0;
        const k = r.product_id;
        if (!byProduct[k]) byProduct[k] = { product_id: k, name: r.pname || k, units: 0, revenue: 0, cost: 0 };
        byProduct[k].units += r.qty || 0; byProduct[k].revenue += rev; byProduct[k].cost += c;
      }
      return json({
        ok: true,
        totals: { orders: rows.length, units, revenue, cogs, profit: revenue - cogs },
        by_product: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue),
        recent: rows.slice(0, 20),
      });
    }

    /* ── Compose: put a NEW dress onto an EXISTING model photo (AI) ──
       Used by admin "Use existing photos": reuse the model/pose/background,
       swap in a freshly shot/uploaded garment. One person image per call so the
       client can show per-side progress and survive a single failure. */
    if (body.action === "compose") {
      if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not set" }, 500);
      const personUrl = String(body.person_image || "");
      const garment = String(body.garment || "");
      if (!personUrl || !garment) return json({ error: "person_image and garment are required" }, 400);
      const personBlob = personUrl.startsWith("data:") ? dataUrlToBlob(personUrl) : await urlToBlob(personUrl);
      const garmentBlob = dataUrlToBlob(garment);
      const prompt =
        `Replace the outfit worn by the person in the FIRST image with the garment ` +
        `shown in the SECOND image, so they are naturally wearing the new garment. ` +
        `Preserve the person's face, hair, skin, body, pose and the background exactly. ` +
        `Faithfully match the new garment's fabric, colour, print, neckline and cut. ` +
        `Realistic fit, natural folds, correct proportions, photorealistic catalogue-quality result.`;
      const imgs = await imageEdit({
        apiKey: env.OPENAI_API_KEY, model: getModel(env), quality: getQuality(env), n: 1, size: "1024x1536",
        prompt, images: [{ blob: personBlob, name: "person.jpg" }, { blob: garmentBlob, name: "garment.png" }],
      });
      if (!imgs[0]) return json({ error: "AI could not compose this side" }, 502);
      return json({ ok: true, image: imgs[0] });
    }

    /* ── Dashboard (invest / earning + category→product stats) ── */
    if (body.action === "dashboard") {
      // Per-product all-time sold + revenue from orders.
      const { results: prows } = await env.DB.prepare(
        `SELECT p.id, p.name, p.category, p.price, p.cost, p.stock,
                COALESCE(SUM(o.qty), 0)    AS sold,
                COALESCE(SUM(o.amount), 0) AS revenue
         FROM products p LEFT JOIN orders o ON o.product_id = p.id
         GROUP BY p.id
         ORDER BY p.category, p.name`
      ).all();
      // Category display names.
      const { results: crows } = await env.DB.prepare("SELECT slug, name FROM categories").all();
      const catName = {};
      for (const c of (crows || [])) catName[c.slug] = c.name;

      const cats = {};
      let demo = false;
      const totals = { invest: 0, earning: 0, cogs: 0, units_sold: 0, in_stock: 0, stock_value: 0 };
      for (const r of (prows || [])) {
        const stock = r.stock || 0, unitCost = r.cost || 0;
        let sold = r.sold || 0, revenue = r.revenue || 0;
        if (sold === 0 && revenue === 0) {              // no real sales yet → demo figures
          sold = demoStats(r.id).sold_all; revenue = sold * (r.price || 0); demo = true;
        }
        const purchased = stock + sold;                 // units ever acquired (orders decrement stock)
        const invested = unitCost * purchased;          // money put into this SKU
        const cogs = unitCost * sold;                   // cost of what sold
        const prod = {
          id: r.id, name: r.name, price: r.price, unit_cost: unitCost,
          purchased, stock, sold, cost: invested, sale: revenue, profit: revenue - cogs,
        };
        totals.invest += invested; totals.earning += revenue; totals.cogs += cogs;
        totals.units_sold += sold; totals.in_stock += stock; totals.stock_value += unitCost * stock;

        const key = r.category || "uncategorised";
        if (!cats[key]) cats[key] = { slug: key, name: catName[key] || key, purchased: 0, stock: 0, sold: 0, cost: 0, sale: 0, profit: 0, products: [] };
        const c = cats[key];
        c.purchased += purchased; c.stock += stock; c.sold += sold; c.cost += invested; c.sale += revenue; c.profit += (revenue - cogs);
        c.products.push(prod);
      }
      totals.profit = totals.earning - totals.cogs;
      return json({ ok: true, demo, totals, categories: Object.values(cats).sort((a, b) => b.sale - a.sale) });
    }

    /* ── Analytics (movement, reorder, low-stock) ── */
    if (body.action === "analytics") {
      const windowDays = Math.max(7, Math.min(180, parseInt(body.window_days, 10) || 30));
      const since = new Date(Date.now() - windowDays * 864e5).toISOString();
      const { results: prows } = await env.DB.prepare(
        `SELECT p.id, p.name, p.category, p.price, p.cost, p.stock,
                COALESCE(SUM(CASE WHEN o.created_at >= ? THEN o.qty END), 0) AS sold_win,
                COALESCE(SUM(o.qty), 0) AS sold_all
         FROM products p LEFT JOIN orders o ON o.product_id = p.id
         GROUP BY p.id`
      ).bind(since).all();

      const TARGET_COVER = 30;   // aim to hold ~30 days of stock
      const LOW_COVER = 10;      // reorder when under ~10 days of cover
      let demo = false;
      const items = (prows || []).map((r) => {
        const stock = r.stock || 0;
        let soldWin = r.sold_win || 0, soldAll = r.sold_all || 0;
        if (soldAll === 0) { const d = demoStats(r.id); soldAll = d.sold_all; soldWin = d.sold_win; if (soldAll) demo = true; }
        const rate = soldWin / windowDays;               // units/day
        const daysCover = rate > 0 ? stock / rate : (stock > 0 ? Infinity : 0);
        return { id: r.id, name: r.name, category: r.category, price: r.price, cost: r.cost || 0, stock, sold_win: soldWin, sold_all: soldAll, rate, days_cover: daysCover };
      });

      const sortRate = (a, b) => b.rate - a.rate || b.sold_win - a.sold_win;
      const movers = items.filter((i) => i.sold_win > 0).sort(sortRate);
      const cut = Math.max(1, Math.ceil(movers.length / 3));
      const fast = movers.slice(0, cut);
      const slow = movers.slice(cut);                    // sold at least 1 but slower
      const dead = items.filter((i) => i.sold_win === 0).sort((a, b) => b.stock - a.stock);

      // What to buy: fast/steady movers whose cover is running low.
      const reorder = movers
        .filter((i) => i.days_cover < LOW_COVER)
        .map((i) => {
          const target = Math.ceil(i.rate * TARGET_COVER);
          const qty = Math.max(1, target - i.stock);
          return { id: i.id, name: i.name, category: i.category, stock: i.stock, rate: i.rate, sold_win: i.sold_win,
                   recommend_qty: qty, unit_cost: i.cost, est_cost: qty * i.cost,
                   reason: i.stock === 0 ? "Out of stock — selling fast" : `~${i.days_cover.toFixed(0)} days of stock left` };
        })
        .sort((a, b) => b.rate - a.rate);

      // Low stock alerts (any SKU low on units, even slow movers with some pull).
      const low_stock = items
        .filter((i) => i.stock > 0 && i.stock <= 5)
        .sort((a, b) => a.stock - b.stock)
        .map((i) => ({ id: i.id, name: i.name, stock: i.stock, sold_win: i.sold_win }));

      const most_sold = [...items].sort((a, b) => b.sold_all - a.sold_all).filter((i) => i.sold_all > 0).slice(0, 8);

      return json({
        ok: true, demo, window_days: windowDays,
        fast: fast.slice(0, 12), slow: slow.slice(0, 12), dead: dead.slice(0, 12),
        most_sold, reorder, low_stock,
        reorder_total_cost: reorder.reduce((s, r) => s + r.est_cost, 0),
      });
    }

    /* ── Staff (owner only) ─────────────────────────── */
    if (body.action === "staff-list") {
      if (!isOwner) return json({ error: "Owner only" }, 403);
      const { results } = await env.DB.prepare("SELECT id, username, phone, role, active, created_at FROM admins ORDER BY created_at").all();
      return json({ staff: results || [] });
    }

    if (body.action === "staff-create") {
      if (!isOwner) return json({ error: "Owner only" }, 403);
      const username = String(body.username || "").trim().toLowerCase().slice(0, 40);
      const password = String(body.password || "");
      const phone = String(body.phone || "").replace(/\D/g, "");
      if (username.length < 3) return json({ error: "Username must be 3+ characters" }, 400);
      if (password.length < 6) return json({ error: "Password must be 6+ characters" }, 400);
      const dupe = await env.DB.prepare("SELECT id FROM admins WHERE username = ?").bind(username).first();
      if (dupe) return json({ error: "Username already taken" }, 409);
      const { hash, salt } = await hashPassword(password);
      const code = recoveryCode();
      const recovery_hash = await sha256hex(code);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO admins (id, username, phone, pass_hash, pass_salt, recovery_hash, role, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'staff', 1, ?)`
      ).bind(id, username, phone, hash, salt, recovery_hash, new Date().toISOString()).run();
      return json({ ok: true, id, recovery_code: code });
    }

    if (body.action === "staff-set-active") {
      if (!isOwner) return json({ error: "Owner only" }, 403);
      const id = String(body.id || "");
      const active = body.active ? 1 : 0;
      const target = await env.DB.prepare("SELECT role FROM admins WHERE id = ?").bind(id).first();
      if (!target) return json({ error: "Not found" }, 404);
      if (target.role === "owner") return json({ error: "Can't deactivate the owner" }, 400);
      await env.DB.prepare("UPDATE admins SET active = ? WHERE id = ?").bind(active, id).run();
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
