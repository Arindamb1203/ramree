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

---

## Session 5 — 2026-07-05 · Fix 360 arrows, pose guide, real-photo upload, AI Kurseong hero

User feedback: (1) 360 arrows don't work + AI angles look wrong → wants to upload real 360 photos; (2) try-on pose guide "unavailable"; (3) landing should use AI-generated Kurseong imagery (AI-made = no copyright).

### Pose guide fix (#2)
- Root cause: the ESM `+esm` TF.js import didn't register the WebGL backend on mobile → `loadPoseDetector` threw → "pose guide unavailable".
- Rewrote `pose.js` to inject the official **UMD** builds via ordered `<script>` tags (tfjs-core, converter, backend-webgl, pose-detection@2.1.3), then `tf.setBackend("webgl")` + `createDetector(MoveNet Lightning)`. Verified the CDN scripts return 200.

### 360 viewer fix (#1)
- Root cause: `viewer.setPointerCapture()` on pointerdown captured the pointer to the viewer, so taps never reached the arrow buttons; `stopIntro()` also reset to frame 0.
- Rewrote the interaction in `product.js`: arrows have their own `click` (with `stopPropagation`); drag ignores pointerdowns that start on `.v-arrow`/`.heart-btn`; move/up listen on `window` (no capture) with `onLeave` cleanup; intro auto-spin waits for all frames to decode, checks the viewer is still mounted, and doesn't fight user input.

### Real product photos — Admin (#1 real fix)
- Added `functions/api/admin.js` (POST, protected by **ADMIN_KEY** secret): actions `list`, `hero` (generate AI Kurseong images), `product-images` (store uploaded photos in KV `photo/<id>/...`, set as the product's images → replaces AI angles with real 360). Routed `/api/admin` in `src/index.js`.
- Added `_openai.js` `imageGenerate` (text-to-image via images/generations).
- New **`public/admin.html`** (served at `/admin`, `.html` dropped by Workers): password gate (localStorage), product list, multi-file picker that **downscales to ~1200px JPEG client-side** before upload, and a "Generate landing image" button. Set `ADMIN_KEY` secret = `ramree-8ac1249ffb45` (via `wrangler secret put`).

### AI Kurseong landing (#3)
- `admin` `hero` action generates an original Kurseong dawn scene (tea gardens + Kanchenjunga) via gpt-image-1, caches to KV `hero/1`. Generated it → `/media/hero/1` (HTTP 200, 2 MB).
- `catalog.js` scene now loads `/media/hero/1` as a background photo (`onload` adds `.has-photo` → hides the SVG ridge fallback, switches brand text to light + adds a legibility veil); `onerror` falls back to the ridge illustration.

### Verified
- Deploy OK (bindings incl. MEDIA_KV). `/admin` 200; admin `list` works with key, wrong key → 401; hero image serves; pose UMD scripts 200.

### Reality note to convey
- AI angle 360 will always look imperfect (independent generations, not a true turntable). The real 360 comes from **uploading multiple real photos per product at /admin** — that's now the recommended path; AI angles remain only a fallback for products with a single photo.

---

## Session 6 — 2026-07-10 · Admin owner console: Dashboard, Analytics, guided camera Upload

Goal: an owner-only admin, reached from a button on the shop, with three easy pages — (1) money + stock dashboard, (2) buying analytics, (3) super-simple guided-camera product upload. Built on the multi-admin auth foundation already in the working tree (`functions/api/_auth.js`, `admin-auth.js`, and `admin.js` `accounts`/`staff-*` actions: PBKDF2 passwords, D1 `admins`+`admin_sessions`, owner/staff roles, recovery codes).

### Shop entry (button)
- `catalog.js`: added a discreet shield **`.admin-fab`** (top-right of the home scene) linking to `/admin.html`, where the existing username/password gate takes over. Styled in `styles.css` (frosted circle, anchors to `.stage`).

### Backend — two new `functions/api/admin.js` actions (token-auth, same as the rest)
- **`dashboard`**: one `products LEFT JOIN orders GROUP BY product` query →
  - Totals: **Total Invest** = Σ cost×(stock+sold), **Total Earning** = Σ order revenue, Profit = earning − COGS(sold), plus stock value / units in stock.
  - Per category (sorted by sales) → per product: purchased (=stock+sold, since orders decrement stock), in stock, sold, cost (invested), sale (revenue), profit.
- **`analytics`** (default 30-day window): per-product sold-in-window → units/day rate & days-of-cover. Classifies **fast / slow / idle** movers; **What to buy** = movers with <10 days cover, recommend_qty to reach ~30-day cover (+ est restock cost); **Low stock** alerts (≤5 left); **Most sold** all-time. SQL validated against a scratch SQLite build of `schema.sql`.

### Frontend — `public/admin.html` restructured
- Tabs are now **Dashboard · Analytics · Upload · Products · Staff · Settings** (old "Add product" + "Accounts" tabs folded in / replaced).
- **Dashboard**: two big Invest/Earning KPI cards + profit/stock; category cards that **expand on tap** to show each product's 6-stat grid.
- **Analytics**: "What to buy" and "Low stock" alert cards, then Fast/Slow/Idle mover lists and all-time Most sold.
- **Upload (super simple)**: big "Open camera" → **guided 4-side capture** (Front/Right/Back/Left) mirroring the shop try-on. Front shot auto-captures on a held full-body MoveNet pose (CDN UMD, lazy-loaded); side/back fall back to a fast manual "Capture now" (pose can't lock when facing away). Each frame is **beautified + downscaled client-side** (canvas `brightness/contrast/saturate` + ≤1080px JPEG q0.82) to keep the site light and uploads fast. Then a 4-field form — Name, Cost price, Sell price, Quantity (+ category) — creates the product (`product-save`) and sets its photos (`product-images`). Gallery-pick fallback included; camera stops on cancel/tab-switch.

### Verified
- `node --check` on `admin.js`, `src/index.js`, `catalog.js`, and the extracted `admin.html` script — all clean.
- Dashboard + analytics SQL executed against an in-memory SQLite from `schema.sql` with sample products/orders → correct sold/revenue/window aggregates and reorder maths (out-of-stock fast mover → recommend restock; low-stock + idle correctly separated).
- Not yet run on-device: live camera capture + a real end-to-end upload (needs a phone + deployed Worker with D1/KV).
