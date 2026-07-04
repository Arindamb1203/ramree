/* OpenAI image generation helper (server-side only).
   Uses the images/edits endpoint with gpt-image-1 / gpt-image-1.5.
   API key comes from env.OPENAI_API_KEY — never exposed to the client. */

const OPENAI_EDITS_URL = "https://api.openai.com/v1/images/edits";

export function getModel(env) {
  return env.OPENAI_IMAGE_MODEL || "gpt-image-1";
}
export function getQuality(env) {
  // Medium is the recommended minimum for realistic results.
  return env.OPENAI_IMAGE_QUALITY || "medium";
}

/* Fetch a remote image URL into a Blob suitable for multipart upload. */
export async function urlToBlob(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't fetch source image (${res.status})`);
  const type = res.headers.get("content-type") || "image/png";
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type });
}

/* Convert a data URL (data:image/jpeg;base64,....) into a Blob. */
export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || "");
  if (!m) throw new Error("Invalid image data");
  const type = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/* Call images/edits. `images` is an array of { blob, name }.
   Returns an array of data URLs (PNG). */
export async function imageEdit({ apiKey, model, prompt, images, size = "1024x1536", quality = "medium", n = 1 }) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("n", String(n));
  for (const img of images) {
    form.append("image[]", img.blob, img.name || "image.png");
  }

  const res = await fetch(OPENAI_EDITS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || `OpenAI error (${res.status})`;
    throw new Error(msg);
  }
  const out = (data && data.data) || [];
  return out.map((d) => `data:image/png;base64,${d.b64_json}`);
}
