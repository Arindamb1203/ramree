/* POST /api/tryon  { product_id, image (data URL of the person) }
   Composites the person wearing the selected garment via OpenAI image editing.

   PRIVACY: the person's photo is processed in-memory for this single request
   and is NEVER written to D1 or any storage. It exists only for the duration
   of this function call. */
import { json, preflight, ensureTables, parseImages } from "./_utils.js";
import { getModel, getQuality, urlToBlob, dataUrlToBlob, imageEdit } from "./_openai.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return preflight();
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.DB) return json({ error: "D1 not configured" }, 500);
  if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }

  const productId = String(body.product_id || "");
  const personDataUrl = body.image;
  if (!productId || !personDataUrl) return json({ error: "Missing product_id or image" }, 400);

  await ensureTables(env);

  try {
    const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(productId).first();
    if (!row) return json({ error: "Product not found" }, 404);
    const product = parseImages(row);
    const garmentUrl = product.images[0];
    if (!garmentUrl) return json({ error: "Product has no image" }, 400);

    // Person photo (in-memory) + garment reference photo.
    const personBlob = dataUrlToBlob(personDataUrl);   // discarded when this request ends
    const garmentBlob = await urlToBlob(garmentUrl);

    const prompt =
      `Dress the person in the FIRST image so they are naturally wearing the ` +
      `"${product.name}" garment shown in the SECOND image. Preserve the person's ` +
      `face, body, pose and background exactly. Match the garment's fabric, colour, ` +
      `print and cut faithfully. Realistic fit, natural folds, correct proportions, ` +
      `photorealistic result suitable for a fashion try-on preview.`;

    const imgs = await imageEdit({
      apiKey: env.OPENAI_API_KEY,
      model: getModel(env),
      quality: getQuality(env),
      n: 1,
      size: "1024x1536",
      prompt,
      images: [
        { blob: personBlob, name: "person.jpg" },
        { blob: garmentBlob, name: "garment.png" },
      ],
    });

    if (!imgs[0]) return json({ error: "Try-on generation failed" }, 502);
    // Only the generated result is returned; the person photo is not stored.
    return json({ image: imgs[0] });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
