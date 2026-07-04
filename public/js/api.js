/* Ramree — API helpers (talks to Cloudflare Pages Functions under /api) */

async function req(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  categories: () => req("/api/products?categories=1"),
  productsByCategory: (slug) => req(`/api/products?category=${encodeURIComponent(slug)}`),
  product: (id) => req(`/api/products?id=${encodeURIComponent(id)}`),

  // Generate AI angle views for a single-photo product
  generateAngles: (id) => req("/api/generate-angles", {
    method: "POST", body: JSON.stringify({ id }),
  }),

  saveLead: (payload) => req("/api/lead", {
    method: "POST", body: JSON.stringify(payload),
  }),

  addWishlist: (payload) => req("/api/wishlist", {
    method: "POST", body: JSON.stringify(payload),
  }),

  createOrder: (payload) => req("/api/order", {
    method: "POST", body: JSON.stringify(payload),
  }),

  optOut: (whatsapp_number, opt_out) => req("/api/optout", {
    method: "POST", body: JSON.stringify({ whatsapp_number, opt_out }),
  }),

  // Try-on: send person photo (base64) + product id; returns generated image (base64/url).
  // The person photo is NOT stored server-side.
  tryOn: (payload) => req("/api/tryon", {
    method: "POST", body: JSON.stringify(payload),
  }),
};
