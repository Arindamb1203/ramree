/* Admin API (protected by ADMIN_KEY).
   POST /api/admin { key, action, ... }

   Actions:
   - "hero": generate AI Kurseong landing images → cache in KV under hero/<n>
   - "product-images": { product_id, images:[dataURL,...] } → cache real photos
       in KV and set them as the product's images (replaces AI angles)
   - "list": return products (id, name, category, image count)
*/
import { json, preflight, ensureTables, parseImages } from "./_utils.js";
import { getModel, imageGenerate, dataUrlToBytes } from "./_openai.js";

const HERO_PROMPTS = [
  "A serene, premium travel photograph of Kurseong hill town in the Darjeeling Himalayas at misty dawn: layered emerald tea gardens on rolling ridges, pine forests, low drifting clouds, distant snow-capped Kanchenjunga glowing with soft golden sunrise light, muted sage-green and warm gold tones, tranquil and luxurious, no people, no text, no watermark",
];

async function putImage(env, key, dataUrl) {
  const { bytes, contentType } = dataUrlToBytes(dataUrl);
  await env.MEDIA_KV.put(key, bytes, { metadata: { contentType } });
  return `/media/${key}`;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.DB) return json({ error: "D1 not configured" }, 500);
  if (!env.ADMIN_KEY) return json({ error: "Admin not configured (set ADMIN_KEY secret)" }, 500);
  if (!env.MEDIA_KV) return json({ error: "MEDIA_KV not configured" }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }

  if (body.key !== env.ADMIN_KEY) return json({ error: "Unauthorized" }, 401);

  await ensureTables(env);

  try {
    if (body.action === "list") {
      const { results } = await env.DB.prepare("SELECT id, name, category, images FROM products ORDER BY category, name").all();
      const products = (results || []).map((r) => {
        const p = parseImages(r);
        return { id: p.id, name: p.name, category: p.category, image_count: p.images.length, first: p.images[0] || "" };
      });
      return json({ products });
    }

    if (body.action === "hero") {
      if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not set" }, 500);
      const urls = [];
      for (let i = 0; i < HERO_PROMPTS.length; i++) {
        const imgs = await imageGenerate({
          apiKey: env.OPENAI_API_KEY, model: getModel(env),
          prompt: HERO_PROMPTS[i], size: "1536x1024", quality: env.OPENAI_HERO_QUALITY || "medium", n: 1,
        });
        if (imgs[0]) urls.push(await putImage(env, `hero/${i + 1}`, imgs[0]));
      }
      if (!urls.length) return json({ error: "Hero generation failed" }, 502);
      return json({ ok: true, images: urls });
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
        urls.push(await putImage(env, `photo/${id}/${Date.now()}-${i + 1}`, images[i]));
      }
      await env.DB.prepare("UPDATE products SET images = ? WHERE id = ?").bind(JSON.stringify(urls), id).run();
      return json({ ok: true, images: urls });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
