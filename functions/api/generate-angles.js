/* POST /api/generate-angles  { id }
   Generates plausible additional angle views for a single-photo product.
   Returns ephemeral data URLs (NOT persisted — regenerated on demand).
   These are generative approximations, not photos of the real garment's back/sides. */
import { json, preflight, ensureTables, parseImages } from "./_utils.js";
import { getModel, urlToBlob, imageEdit, dataUrlToBytes } from "./_openai.js";

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
    // Angle previews are approximations — use faster/cheaper "low" quality by
    // default so the wait is shorter. (Try-on keeps the higher default quality.)
    const quality = env.OPENAI_ANGLE_QUALITY || "low";

    // Generate all angles in parallel (each independent for better angle control).
    // Sequential would stack ~30s per image; parallel keeps total wall time ~1 image.
    const settled = await Promise.allSettled(
      ANGLE_PROMPTS.map((prompt) => imageEdit({
        apiKey: env.OPENAI_API_KEY, model, quality, n: 1,
        prompt: prompt + ". Photorealistic fashion e-commerce product photo.",
        images: [{ blob, name: "garment.png" }],
      }))
    );
    const results = [];
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value[0]) results.push(s.value[0]);
    }

    if (!results.length) return json({ error: "Angle generation failed" }, 502);

    // Cache each generated image in KV and build stable /media URLs, so the
    // product is generated ONCE — reused instantly & free on every later view.
    const mediaUrls = [];
    if (env.MEDIA_KV) {
      for (let i = 0; i < results.length; i++) {
        try {
          const { bytes, contentType } = dataUrlToBytes(results[i]);
          const key = `angle/${id}/${i + 1}`;
          await env.MEDIA_KV.put(key, bytes, { metadata: { contentType } });
          mediaUrls.push(`/media/${key}`);
        } catch (e) { /* fall back to the ephemeral data URL below */ }
      }
    }

    const finalImages = mediaUrls.length ? mediaUrls : results;
    // Persist original + angle views on the product so 360° is default next time.
    try {
      const persisted = JSON.stringify([product.images[0], ...finalImages]);
      await env.DB.prepare("UPDATE products SET images = ? WHERE id = ?").bind(persisted, id).run();
    } catch (e) { /* non-fatal */ }

    return json({ images: finalImages, ai: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
