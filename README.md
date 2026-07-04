# Ramree

**AI-powered mobile dress shopping web app.** *"Ramree"* is a Nepali-inspired word (from *ramri* — beautiful).

Mobile-only web app — vanilla HTML/CSS/JS, Cloudflare Pages + Pages Functions, Cloudflare D1, and OpenAI image generation. No framework, no native app.

---

## Features

- **Catalog** — 3 categories (Korean T-Shirts, Korean Tops, Rayon Kurti Sets)
- **Product detail** — drag-to-rotate 360° viewer for multi-photo products; **AI-rendered angle views** for single-photo products (generative approximations, clearly labelled)
- **Actions** — Try It On · Buy · Add to Wishlist
- **Lead capture** — name + WhatsApp number, stored in D1 keyed by number
- **Wishlist** — saved under the WhatsApp number
- **Buy** — demo payment via QR (no real gateway; stock decremented in D1)
- **Try It On** — pose-guided camera (MoveNet, client-side, free) with live feedback + auto-capture when the pose holds ~1s → OpenAI compositing → protected result with a *"Do you like it?"* prompt
  - **Privacy:** the captured photo is processed in-memory and **never** stored (not in D1, not on disk)
  - **Screenshot deterrents (soft only):** context-menu/drag disabled, blur on app-switch, watermark overlay. *A determined user can still screenshot — mobile web cannot truly prevent this.*
- **WhatsApp follow-up (demo)** — generates a `wa.me` invite deep link (nothing sent automatically) + an **opt-out** toggle stored against the number

Every screen has a back button and a clean, premium mobile layout.

---

## Project structure

```
ramree/
├── wrangler.toml          # Pages + D1 binding config
├── schema.sql             # D1 tables
├── seed.sql               # sample categories + products
├── public/                # static site (build output dir)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js         # SPA router + shared state/helpers
│       ├── api.js         # fetch wrappers
│       ├── pose.js        # MoveNet pose checker (client-side)
│       ├── wa.js          # WhatsApp follow-up + opt-out block
│       └── screens/       # catalog, product, actions, lead, confirm, buy, tryon
└── functions/api/         # Cloudflare Pages Functions
    ├── _utils.js  _openai.js
    ├── products.js  lead.js  wishlist.js  order.js  optout.js
    └── generate-angles.js  tryon.js
```

---

## Setup

### 1. Create the D1 database

```bash
npx wrangler login                      # or set CLOUDFLARE_API_TOKEN
npx wrangler d1 create ramree-db
```

Copy the printed `database_id` into **`wrangler.toml`** (replace `PASTE_DATABASE_ID_HERE`).

### 2. Apply schema + seed

```bash
npx wrangler d1 execute ramree-db --remote --file=./schema.sql
npx wrangler d1 execute ramree-db --remote --file=./seed.sql
```

### 3. Bind D1 + set secrets in the Cloudflare Pages dashboard

- **Settings → Functions → D1 database bindings:** add binding `DB` → `ramree-db`
- **Settings → Environment variables / Secrets:**
  - `OPENAI_API_KEY` — required for AI angle views and try-on
  - `OPENAI_IMAGE_MODEL` — optional, `gpt-image-1` (default) or `gpt-image-1.5`
  - `OPENAI_IMAGE_QUALITY` — optional, `medium` (default, recommended min), `high`, or `low`

### 4. Deploy

Push to `master` — Cloudflare Pages auto-builds (no build command, output dir `public`).

### Local dev

```bash
echo "OPENAI_API_KEY=sk-..." > .dev.vars
npx wrangler d1 execute ramree-db --local --file=./schema.sql
npx wrangler d1 execute ramree-db --local --file=./seed.sql
npx wrangler pages dev public
```

---

## Cost note

OpenAI image generation ≈ ₹3.5–5 per image at *Medium* quality (recommended minimum for realistic try-on), ≈ ₹14–17 at *High*. A try-on session generates 1 image; AI angle views generate up to 3. Budget per session accordingly.

## Known limitations

- AI angle views are **generative**, not literal reconstructions of the real garment's back/sides.
- Try-on realism depends heavily on input photo quality — the pose-guide camera exists to improve this.
- Screenshot blocking on mobile web is a **deterrent only**, never a guarantee.
