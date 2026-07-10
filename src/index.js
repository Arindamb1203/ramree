/* Ramree — Worker entry point.
   Static assets (public/) are served automatically by the ASSETS binding.
   This Worker runs only for requests with no matching static file — i.e. /api/*.
   It routes those to the existing handlers (written as Pages-style onRequest). */
import { onRequest as products } from "../functions/api/products.js";
import { onRequest as lead } from "../functions/api/lead.js";
import { onRequest as wishlist } from "../functions/api/wishlist.js";
import { onRequest as order } from "../functions/api/order.js";
import { onRequest as optout } from "../functions/api/optout.js";
import { onRequest as generateAngles } from "../functions/api/generate-angles.js";
import { onRequest as tryon } from "../functions/api/tryon.js";
import { onRequest as admin } from "../functions/api/admin.js";
import { onRequest as adminAuth } from "../functions/api/admin-auth.js";

const ROUTES = {
  "/api/products": products,
  "/api/lead": lead,
  "/api/wishlist": wishlist,
  "/api/order": order,
  "/api/optout": optout,
  "/api/generate-angles": generateAngles,
  "/api/tryon": tryon,
  "/api/admin": admin,
  "/api/admin-auth": adminAuth,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Serve cached media (AI angle images) from KV.
    if (url.pathname.startsWith("/media/")) {
      if (!env.MEDIA_KV) return new Response("Not found", { status: 404 });
      const key = decodeURIComponent(url.pathname.slice("/media/".length));
      const obj = await env.MEDIA_KV.getWithMetadata(key, "arrayBuffer");
      if (!obj || !obj.value) return new Response("Not found", { status: 404 });
      const ct = (obj.metadata && obj.metadata.contentType) || "image/png";
      return new Response(obj.value, {
        headers: { "Content-Type": ct, "Cache-Control": "public, max-age=31536000, immutable" },
      });
    }

    const handler = ROUTES[url.pathname];
    if (handler) {
      // Handlers expect a Pages-style context object.
      return handler({ request, env, ctx });
    }
    // Not an API route and no static asset matched → let ASSETS answer (404 etc.)
    return env.ASSETS.fetch(request);
  },
};
