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

---

## Session 2 — 2026-07-05 · D1 live + Pages→Worker fix + deploy

### Done
- User ran `npx wrangler login` (interactive, browser OAuth). Credentials then cached, so subsequent wrangler calls worked from the tool shell.
- Created D1 **ramree-db** (id `f6375c7e-ccfe-428c-8e85-95e065967bdd`, region OC); wired the id into `wrangler.toml`.
- Applied `schema.sql` (5 tables) + `seed.sql` (3 categories, 6 products) to `--remote`. Verified counts (3/6).

### Mistake found & corrected — Pages vs Worker mismatch
- **Problem:** the Cloudflare project `ramree` was created by **connecting the GitHub repo**, which in Cloudflare's current dashboard produces a **Worker** (Workers Builds), *not* a Pages project. Every Git build failed and "No URLs enabled" — because the repo was written for **Pages** (`functions/` dir + `pages_build_output_dir`), which a Worker doesn't run.
- **Fix (convert to Worker + static assets):**
  - Rewrote `wrangler.toml` → Worker format: `main = "src/index.js"`, `[assets] directory="./public" binding="ASSETS"`, `nodejs_compat`, D1 binding `DB`.
  - Added **`src/index.js`** — Worker entry that routes `/api/*` to the existing `functions/api/*` handlers (called with a synthesized `{request, env, ctx}` context) and lets the ASSETS binding serve everything else. **No changes needed to the function handlers** — they already export `onRequest(context)`.
  - Added minimal **`package.json`** (wrangler devDep + dev/deploy scripts).
- Deployed directly with `npx wrangler deploy` (bypasses the failing Git build). Bindings confirmed at deploy: `env.DB (ramree-db)`, `env.ASSETS`. workers.dev URL auto-enabled.

### Live
- **https://ramree.arindambhowmik2013.workers.dev** — home `HTTP 200`; `/api/products?categories=1` and `?category=…` return real D1 data. Verified.

### Still pending
- `OPENAI_API_KEY` secret not yet set → AI angle views + try-on will error until added (`npx wrangler secret put OPENAI_API_KEY` or dashboard). Catalog/product/wishlist/buy all work without it.
- Real product photos still needed (Unsplash placeholders in use).
- The dashboard D1 binding the user was mid-adding is now redundant (wrangler.toml defines it); harmless either way.

---

## Session 3 — 2026-07-05 · OpenAI key live + slow-generation fix

### Done
- User added `OPENAI_API_KEY` as a Secret via the dashboard and deployed → AI features active. (Secrets persist across future `wrangler deploy`, so CLI redeploys won't wipe it.)

### Problem: AI angle generation "taking too much time" (stuck on "Rendering")
- **Cause:** `generate-angles.js` generated 3 images **sequentially**; gpt-image-1 at medium quality is ~50s/image → ~2.5 min total, felt frozen.
- **Fixes:**
  - Parallelized the 3 angle calls with `Promise.allSettled` (wall time ≈ one image instead of 3×).
  - Angle quality dropped to **`low`** (`OPENAI_ANGLE_QUALITY`, default low) — previews are approximations, so faster + cheaper (~₹1-2/img). Try-on keeps default medium for realism.
  - Honest loading copy: try-on "up to a minute", angle button "(up to ~30s)" so it doesn't read as frozen.
- **Verified live:** `POST /api/generate-angles {"id":"kt-001"}` → HTTP 200, 3 images, ~54s at medium (pre-low-quality change). Confirms the OpenAI key works end-to-end.

### Reality note
- AI image latency (~30–50s) is inherent to gpt-image-1; parallelism + quality tuning + clear messaging is the mitigation, not elimination. Try-on is a single image so it will still take ~30–50s.

---

## Session 4 — 2026-07-05 · v2: caching, Misty Dawn redesign, advanced 360, checkout

Driven by 4 pieces of user feedback: (1) can't rotate 360, wants advanced UI; (2) 360 should be default, no button; (3) app dull, wants Kurseong/Himalaya sophistication; (4) product page needs Try-It-On + Continue→full checkout (qty/address/phone).

### Angle caching (fixes #2 + makes #1 possible)
- R2 unavailable (account not activated) → used **KV** instead. Created namespace `MEDIA_KV` (id `2d903243f78542c5a3ef7a426c3a8cc7`), bound in `wrangler.toml`.
- `generate-angles.js` now caches each generated PNG to KV (`angle/<id>/<n>`), persists `/media/...` URLs onto the product in D1, and returns them → **generated once, then instant & free forever**. Added `dataUrlToBytes` to `_openai.js`.
- New Worker route `/media/*` in `src/index.js` serves cached images from KV with a 1-yr immutable cache header.
- **Pre-warmed all 6 products** (3 angles each). `rk-002`'s Unsplash placeholder was a 404 → swapped for a working URL in D1 + `seed.sql`, then regenerated. Verified: `/media/angle/kt-001/1` → HTTP 200, 1.8 MB PNG; products return 4 images.

### Design overhaul — "Misty Dawn Himalaya" (#3)
- Full `styles.css` rewrite: cloud-cream / pine-ink / tea-sage / sunrise-gold palette, paper grain, refined shadows/radii.
- Landing `catalog.js` now renders a layered **Kanchenjunga ridge SVG scene** with a soft sunrise sun + haze, serif brand lockup. Category tiles get a go-arrow + ridge motif; product cards show a 360° badge. `theme-color` → cream.

### Advanced 360° viewer (#1)
- `product.js` rewritten: drag-to-rotate **plus** left/right arrow buttons, dots, a one-time **intro auto-spin** to signal rotatability, frame preloading, and a "Drag to rotate" hint. Auto-active whenever a product has >1 image.
- Single-photo products **auto-generate** angles on load (no button) with a "Preparing 360°…" chip, then upgrade to the AI-badged viewer.

### Product CTAs + checkout (#4)
- Product page: wishlist **heart** on the photo + two CTAs — **Try It On** (→ lead capture → camera) and **Continue** (→ checkout).
- New `checkout.js`: quantity stepper (capped at stock), live order summary/total, name, WhatsApp, delivery address (street/city/PIN) → saves lead → `buy` (QR) → order.
- `order.js` + schema + `_utils` ensureTables now store `address` (added column live via ALTER). `buy.js` uses qty×price and passes address. `lead.js` now routes only tryon/wishlist (buy goes via checkout). Removed dead `actions.js`; try-on "No"/error now `backTo("product")`. Registered `checkout` in `app.js`; added `state.checkout`.

### Verified live
- index/css/checkout.js → HTTP 200; kt-001 & rk-002 → 3 cached angle URLs each; test order (kt-002 ×2 w/ Kurseong address) → stored correctly, stock decremented. Test row + stock cleaned up afterward.

### Notes / pending
- KV-cached PNGs are ~1.8 MB each (medium... actually low quality). Fine for KV (25 MB value limit, 1 GB free storage).
- Still: real product photos; phone end-to-end test of camera try-on with the new flow.
