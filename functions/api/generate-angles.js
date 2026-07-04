/* POST /api/generate-angles  { id }
   Generates plausible additional angle views for a single-photo product.
   Returns ephemeral data URLs (NOT persisted — regenerated on demand).
   These are generative approximations, not photos of the real garment's back/sides. */
import { json, preflight, ensureTables, parseImages } from "./_utils.js";
import { getModel, getQuality, urlToBlob, imageEdit } from "./_openai.js";

const ANGLE_PROMPTS = [
  "the same garment worn by the same model, rotated to a three-quarter left view, identical fabric, colour, print and lighting, clean studio background",
  "the same garment worn by the same model, side profile view, identical fabric, colour, print and lighting, clean studio background",
  "the same garment worn by the same model, rear/back view, identical fabric, colour and print, clean studio background",
];

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.DB) return json({ error: "D1 not configured" }, 500);
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }
  const id = String(body.id || "");
  if (!id) return json({ error: "Product id required" }, 400);

  await ensureTables(env);

  try {
    const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
    if (!row) return json({ error: "Product not found" }, 404);
    const product = parseImages(row);
    const src = product.images[0];
    if (!src) return json({ error: "Product has no source image" }, 400);

    const blob = await urlToBlob(src);
    const model = getModel(env);
    const quality = getQuality(env);

    // Generate each angle independently for better angle control.
    const results = [];
    for (const prompt of ANGLE_PROMPTS) {
      try {
        const imgs = await imageEdit({
          apiKey: env.OPENAI_API_KEY, model, quality, n: 1,
          prompt: prompt + ". Photorealistic fashion e-commerce product photo.",
          images: [{ blob, name: "garment.png" }],
        });
        if (imgs[0]) results.push(imgs[0]);
      } catch (e) { /* skip a failed angle, keep the rest */ }
    }

    if (!results.length) return json({ error: "Angle generation failed" }, 502);
    return json({ images: results, ai: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
