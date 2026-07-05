/* Catalog (landing) + category product grid — Misty Dawn Himalaya */
import { api, go, rupee, escapeHtml } from "../app.js";

const ARROW = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON360 = `<svg viewBox="0 0 24 24" width="12" height="12"><path d="M12 8c5 0 9 1.8 9 4s-4 4-9 4-9-1.8-9-4a3.4 3.4 0 011-2.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 9.8L3 12l2.4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export async function render(view) {
  view.innerHTML = `
    <div class="scene">
      <img class="scene-photo" alt="" src="/media/hero/1"
           onload="this.closest('.scene').classList.add('has-photo')"
           onerror="this.remove()">
      <div class="sun"></div>
      <svg class="ridges" viewBox="0 0 480 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <path d="M0 210 L70 150 L120 185 L190 120 L250 170 L320 110 L400 175 L480 140 L480 300 L0 300 Z" fill="#b9c8bd" opacity=".55"/>
        <path d="M0 240 L60 195 L140 235 L210 180 L290 230 L360 185 L440 235 L480 210 L480 300 L0 300 Z" fill="#8ba690" opacity=".7"/>
        <path d="M0 270 L80 235 L160 268 L240 225 L320 265 L400 230 L480 262 L480 300 L0 300 Z" fill="#5f7d64"/>
        <path d="M0 292 L100 268 L200 290 L300 262 L400 288 L480 272 L480 300 L0 300 Z" fill="#3c5344"/>
      </svg>
      <div class="haze"></div>
      <div class="scene-text">
        <div class="brand">Ram<em>ree</em></div>
        <div class="tag">Beautiful, on you. Discover, try on with AI, and shop — crafted in the hills.</div>
      </div>
    </div>

    <div class="rule"><span class="eyebrow">Shop by category</span></div>
    <div class="tiles" id="tiles">${tileSkeleton()}${tileSkeleton()}${tileSkeleton()}</div>
  `;

  const tiles = view.querySelector("#tiles");
  try {
    const { categories } = await api.categories();
    tiles.innerHTML = "";
    (categories || []).forEach((c) => {
      const el = document.createElement("div");
      const hasImg = !!c.hero_image;
      el.className = "tile" + (hasImg ? "" : " noimg");
      el.innerHTML = `
        ${hasImg ? `<img class="tile-bg" src="${escapeHtml(c.hero_image)}" alt="">` : ""}
        ${hasImg ? `<div class="tile-veil"></div>` : ""}
        <div class="tile-body">
          <div class="tile-name">${escapeHtml(c.name)}</div>
          <div class="tile-sub">${escapeHtml(c.subtitle || "")}</div>
        </div>
        <div class="tile-go">${ARROW}</div>`;
      el.addEventListener("click", () => go("category", { slug: c.slug, name: c.name }, { title: c.name }));
      tiles.appendChild(el);
    });
    if (!categories || !categories.length) tiles.innerHTML = `<div class="empty">No categories yet.</div>`;
  } catch (err) {
    tiles.innerHTML = `<div class="empty">Couldn't load categories.<br><span class="muted">${escapeHtml(err.message)}</span></div>`;
  }
}

const PRICE_RANGES = [
  { key: "any", label: "Any price", test: () => true },
  { key: "u800", label: "Under ₹800", test: (p) => p.price < 800 },
  { key: "800-1200", label: "₹800 – ₹1,200", test: (p) => p.price >= 800 && p.price <= 1200 },
  { key: "1200-1800", label: "₹1,200 – ₹1,800", test: (p) => p.price > 1200 && p.price <= 1800 },
  { key: "o1800", label: "Over ₹1,800", test: (p) => p.price > 1800 },
];
const SORTS = [
  { key: "latest", label: "Latest", fn: (a, b) => (b.created_at || "").localeCompare(a.created_at || "") },
  { key: "price-asc", label: "Price: Low to High", fn: (a, b) => a.price - b.price },
  { key: "price-desc", label: "Price: High to Low", fn: (a, b) => b.price - a.price },
  { key: "rating", label: "Top rated", fn: (a, b) => (b.rating || 0) - (a.rating || 0) },
];

export async function renderCategory(view, { slug, name }) {
  view.innerHTML = `
    <div class="eyebrow">Category</div>
    <h1 class="display">${escapeHtml(name || "")}</h1>
    <div class="grid" id="grid">${cardSkeleton()}${cardSkeleton()}${cardSkeleton()}${cardSkeleton()}</div>
  `;
  const grid = view.querySelector("#grid");

  let all = [];
  try {
    all = (await api.productsByCategory(slug)).products || [];
  } catch (err) {
    grid.innerHTML = `<div class="empty">Couldn't load products.<br><span class="muted">${escapeHtml(err.message)}</span></div>`;
    return;
  }
  if (!all.length) { grid.innerHTML = `<div class="empty">No products in this category yet.</div>`; return; }

  // Available colors / sizes across this category
  const allColors = [...new Set(all.flatMap((p) => p.colors || []))];
  const allSizes = ["XS", "S", "M", "L", "XL", "XXL"].filter((s) => all.some((p) => (p.sizes || []).includes(s)));

  const state = { price: "any", colors: new Set(), sizes: new Set(), sort: "latest" };

  // Toolbar (Sort / Filter) + active chips, inserted before the grid
  const bar = document.createElement("div");
  bar.className = "filterbar";
  bar.innerHTML = `
    <button class="fbtn" id="sortBtn">${SVG_SORT}<span id="sortLabel">Latest</span></button>
    <button class="fbtn" id="filterBtn">${SVG_FILTER}Filter<span class="fcount" id="fcount" hidden>0</span></button>
    <span class="fresult" id="fresult"></span>
  `;
  grid.before(bar);
  const chipsRow = document.createElement("div");
  chipsRow.className = "chips-row"; chipsRow.id = "chips";
  bar.after(chipsRow);

  function activeFilterCount() {
    return (state.price !== "any" ? 1 : 0) + state.colors.size + state.sizes.size;
  }

  function apply() {
    const range = PRICE_RANGES.find((r) => r.key === state.price) || PRICE_RANGES[0];
    let list = all.filter((p) => range.test(p)
      && (state.colors.size === 0 || (p.colors || []).some((c) => state.colors.has(c)))
      && (state.sizes.size === 0 || (p.sizes || []).some((s) => state.sizes.has(s))));
    const sort = SORTS.find((s) => s.key === state.sort) || SORTS[0];
    list = list.slice().sort(sort.fn);

    view.querySelector("#sortLabel").textContent = sort.label;
    const fc = view.querySelector("#fcount"); const n = activeFilterCount();
    fc.hidden = n === 0; fc.textContent = n;
    view.querySelector("#fresult").textContent = `${list.length} item${list.length === 1 ? "" : "s"}`;
    renderChips();
    renderGrid(list);
  }

  function renderChips() {
    const chips = [];
    if (state.price !== "any") chips.push({ t: PRICE_RANGES.find((r) => r.key === state.price).label, clear: () => (state.price = "any") });
    [...state.colors].forEach((c) => chips.push({ t: c, clear: () => state.colors.delete(c) }));
    [...state.sizes].forEach((s) => chips.push({ t: "Size " + s, clear: () => state.sizes.delete(s) }));
    chipsRow.innerHTML = "";
    chips.forEach((c) => {
      const el = document.createElement("button");
      el.className = "chip";
      el.innerHTML = `${escapeHtml(c.t)} <span>✕</span>`;
      el.addEventListener("click", () => { c.clear(); apply(); });
      chipsRow.appendChild(el);
    });
  }

  function renderGrid(list) {
    grid.innerHTML = "";
    if (!list.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">Nothing matches these filters.<br><span class="muted">Try clearing a filter.</span></div>`; return; }
    list.forEach((p) => {
      const img = (p.images && p.images[0]) || "";
      const has360 = p.images && p.images.length > 1;
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="thumb-wrap">
          <img class="thumb" src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy">
          ${has360 ? `<div class="badge360">${ICON360} 360°</div>` : ""}
        </div>
        <div class="card-body">
          <div class="card-name">${escapeHtml(p.name)}</div>
          ${p.rating ? `<div class="stars">${starStr(p.rating)}<span class="rc">${p.rating.toFixed(1)} · ${p.review_count || 0}</span></div>` : ""}
          <div class="card-price">${rupee(p.price)}</div>
        </div>`;
      card.addEventListener("click", () => go("product", { id: p.id }, { title: p.name }));
      grid.appendChild(card);
    });
  }

  view.querySelector("#sortBtn").addEventListener("click", () => openSortSheet(view, state, apply));
  view.querySelector("#filterBtn").addEventListener("click", () => openFilterSheet(view, state, { allColors, allSizes }, apply));

  apply();
}

/* ── Bottom sheets ───────────────────────────────────── */
function openSortSheet(view, state, apply) {
  const body = `<div class="sheet-section">
    ${SORTS.map((s) => `<label class="radio"><input type="radio" name="sort" value="${s.key}" ${state.sort === s.key ? "checked" : ""}><span>${s.label}</span></label>`).join("")}
  </div>`;
  const sheet = mountSheet(view, "Sort by", body, () => {
    const sel = sheet.el.querySelector('input[name="sort"]:checked');
    if (sel) state.sort = sel.value;
    apply(); sheet.close();
  }, "Done");
}

function openFilterSheet(view, state, { allColors, allSizes }, apply) {
  const priceOpts = PRICE_RANGES.map((r) => `<label class="radio"><input type="radio" name="price" value="${r.key}" ${state.price === r.key ? "checked" : ""}><span>${r.label}</span></label>`).join("");
  const colorOpts = allColors.map((c) => `<button class="opt ${state.colors.has(c) ? "on" : ""}" data-color="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
  const sizeOpts = allSizes.map((s) => `<button class="opt ${state.sizes.has(s) ? "on" : ""}" data-size="${s}">${s}</button>`).join("");
  const body = `
    <div class="sheet-section"><div class="sheet-label">Price</div>${priceOpts}</div>
    ${allColors.length ? `<div class="sheet-section"><div class="sheet-label">Colour</div><div class="opt-chips">${colorOpts}</div></div>` : ""}
    ${allSizes.length ? `<div class="sheet-section"><div class="sheet-label">Size</div><div class="opt-chips">${sizeOpts}</div></div>` : ""}
  `;
  const sheet = mountSheet(view, "Filter", body, () => {
    const price = sheet.el.querySelector('input[name="price"]:checked');
    state.price = price ? price.value : "any";
    state.colors = new Set([...sheet.el.querySelectorAll(".opt[data-color].on")].map((b) => b.dataset.color));
    state.sizes = new Set([...sheet.el.querySelectorAll(".opt[data-size].on")].map((b) => b.dataset.size));
    apply(); sheet.close();
  }, "Show results");

  sheet.el.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => b.classList.toggle("on")));
  const clear = document.createElement("button");
  clear.className = "sheet-clear"; clear.textContent = "Clear all";
  clear.addEventListener("click", () => {
    sheet.el.querySelectorAll(".opt.on").forEach((b) => b.classList.remove("on"));
    const any = sheet.el.querySelector('input[name="price"][value="any"]'); if (any) any.checked = true;
  });
  sheet.titleRow.appendChild(clear);
}

function mountSheet(view, title, bodyHtml, onApply, applyLabel) {
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay";
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-titlerow"><div class="sheet-title">${title}</div></div>
      <div class="sheet-body">${bodyHtml}</div>
      <div class="sheet-actions"><button class="btn btn-primary" id="sheetApply">${applyLabel}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));
  const close = () => { overlay.classList.remove("open"); setTimeout(() => overlay.remove(), 260); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#sheetApply").addEventListener("click", onApply);
  return { el: overlay, titleRow: overlay.querySelector(".sheet-titlerow"), close };
}

function starStr(r) {
  const full = Math.round(r);
  let s = "";
  for (let i = 1; i <= 5; i++) s += `<span class="star ${i <= full ? "on" : ""}">★</span>`;
  return s;
}

const SVG_SORT = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_FILTER = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 5h18M6 12h12M10 19h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function tileSkeleton() { return `<div class="tile skeleton" style="min-height:156px;border:none;"></div>`; }
function cardSkeleton() {
  return `<div class="card"><div class="thumb skeleton" style="aspect-ratio:3/4;"></div><div class="card-body"><div class="skeleton" style="height:12px;border-radius:6px;"></div><div class="skeleton" style="height:12px;width:50%;margin-top:8px;border-radius:6px;"></div></div></div>`;
}
