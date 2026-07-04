/* GET /api/products
   ?categories=1          → list categories
   ?category=<slug>       → products in a category
   ?id=<id>               → single product
*/
import { json, preflight, ensureTables, parseImages } from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "GET") return json({ error: "GET only" }, 405);
  if (!env.DB) return json({ error: "D1 not configured" }, 500);

  await ensureTables(env);
  const url = new URL(request.url);

  try {
    if (url.searchParams.get("categories")) {
      const { results } = await env.DB
        .prepare("SELECT slug, name, subtitle, hero_image, sort_order FROM categories ORDER BY sort_order ASC, name ASC")
        .all();
      return json({ categories: results || [] });
    }

    const id = url.searchParams.get("id");
    if (id) {
      const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
      if (!row) return json({ error: "Product not found" }, 404);
      return json({ product: parseImages(row) });
    }

    const category = url.searchParams.get("category");
    if (category) {
      const { results } = await env.DB
        .prepare("SELECT * FROM products WHERE category = ? ORDER BY created_at DESC")
        .bind(category).all();
      return json({ products: (results || []).map(parseImages) });
    }

    // default: everything
    const { results } = await env.DB.prepare("SELECT * FROM products ORDER BY created_at DESC").all();
    return json({ products: (results || []).map(parseImages) });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
