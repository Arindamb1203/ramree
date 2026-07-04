# Ramree — Session Log

A running record of everything done on the project, including mistakes and their corrections. Newest session at the bottom.

---

## Session 1 — 2026-07-04 · Initial build

### Goal
Bootstrap the entire Ramree app from the project spec: mobile-only AI dress-shopping web app on Cloudflare Pages + D1 + OpenAI image generation.

### What was built

**Config & data**
- `.gitignore` — excludes node_modules, `.wrangler/`, `.dev.vars`, `.env`, editor/OS cruft.
- `wrangler.toml` — Pages config (`pages_build_output_dir = "public"`) + D1 binding `DB` → `ramree-db`. `database_id` left as a placeholder to fill after DB creation.
- `schema.sql` — D1 tables: `products`, `categories`, `leads` (name, whatsapp_number PK, opt_out flag), `wishlist`, `orders`.
- `seed.sql` — 3 categories + 6 sample products (Unsplash placeholder images).

**Frontend (`public/`)** — vanilla, no framework, SPA with a navigation stack.
- `index.html` — app shell: sticky topbar with back button, `#stage` for screens, toast. Google Fonts (Fraunces serif + Inter).
- `css/styles.css` — premium mobile theme (ivory paper / ink / muted-rose accent), category tiles, product cards, 360° viewer, action cards, forms, QR block, WhatsApp/opt-out block, pose-guide camera overlay, protected-result watermark, spinner/skeleton, toast.
- `js/app.js` — SPA core: nav stack (`go/replace/back/backTo`), shared in-memory `state`, `render()`, helpers (`rupee`, `escapeHtml`, `toast`, `onLeave`), global contextmenu block on result image.
- `js/api.js` — fetch wrappers for all endpoints.
- `js/pose.js` — TensorFlow.js **MoveNet SinglePose Lightning** loaded lazily from CDN; `analyze()` returns live feedback (step into frame / move back / center / stand straighter / feet visible / perfect).
- `js/wa.js` — shared WhatsApp follow-up: builds `wa.me` invite deep link (demo, nothing auto-sent) + opt-out switch calling `/api/optout`.
- `js/screens/` — `catalog.js` (landing + category grid), `product.js` (360 drag viewer + AI-angle generation button/fallback), `actions.js` (Try/Buy/Wishlist), `lead.js` (name + WhatsApp), `confirm.js` (wishlist confirm + post-try-on Buy/Wishlist choice), `buy.js` (demo QR payment, order creation + stock decrement), `tryon.js` (pose-guided camera with auto-capture, in-memory-only photo, AI result with soft screenshot deterrents + like prompt).

**Backend (`functions/api/`)** — Cloudflare Pages Functions.
- `_utils.js` — CORS/json helpers, number normalization, safety-net table creation, image JSON parsing.
- `_openai.js` — OpenAI `images/edits` helper (gpt-image-1 / 1.5), URL→Blob and dataURL→Blob converters, model/quality from env.
- `products.js` — GET categories / by category / single.
- `lead.js` — upsert lead, preserves opt_out on conflict.
- `wishlist.js` — add (dedupes number+product).
- `order.js` — demo checkout, guarded stock decrement, returns new stock.
- `optout.js` — upsert opt-out flag against a number.
- `generate-angles.js` — 3 AI angle views from a product's single photo (ephemeral data URLs, not persisted — avoids D1 1MB column limit + only user-triggered cost).
- `tryon.js` — composites person photo + garment via OpenAI; **person photo never stored** (in-memory for the single request only).

### Decisions & rationale
- **SPA with a nav stack** (not multi-page) for smooth app-like transitions and a single shared `state`.
- **MoveNet over MediaPipe Pose** — TF.js MoveNet loads cleanly as an ESM CDN bundle and gives the 17 keypoints needed for the full-body/centered/upright/feet-visible checks; robust and free client-side.
- **AI angle views not persisted** — base64 PNGs (~1–2 MB) exceed D1's ~1 MB value limit, and generation is user-triggered, so ephemeral return is correct.
- **Auto-capture** once the pose holds correct ~1s (spec allowed enable-or-auto); manual tap also available before that.
- **Demo QR** rendered from a UPI deep link via the public `api.qrserver.com` image service (display only, no real charge).

### Blocked / deferred
- **D1 creation could not run here** — `npx wrangler d1 create ramree-db` failed with *"non-interactive environment, set CLOUDFLARE_API_TOKEN"*. Wrangler 4.92 is installed but not authenticated in this shell. → Left `database_id` as a placeholder and documented the exact create/execute commands in `README.md`. **User action needed:** run `wrangler login`, create the DB, paste the id, apply `schema.sql` + `seed.sql`, bind `DB` and set `OPENAI_API_KEY` in the Pages dashboard.

### Verification
- `node --check` passed on all 16 JS files (frontend + functions). No live end-to-end run yet (needs D1 + OpenAI key + camera).

### Mistakes / corrections
- None to correct yet this session. (Circular imports between `app.js` and `screens/*` are intentional and safe — imported bindings are only used at call-time, not module-eval time.)

### Next steps
1. User: create/bind D1, seed, set OpenAI secret (see README).
2. Replace Unsplash placeholder product images with real catalog photos.
3. End-to-end test on a phone: catalog → product → try-on (camera + pose + generation) → buy/wishlist → WhatsApp opt-out.
4. Tune pose thresholds and try-on prompt against real captures.
