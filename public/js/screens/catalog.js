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

export async function renderCategory(view, { slug, name }) {
  view.innerHTML = `
    <div class="eyebrow">Category</div>
    <h1 class="display">${escapeHtml(name || "")}</h1>
    <div class="grid" id="grid">${cardSkeleton()}${cardSkeleton()}${cardSkeleton()}${cardSkeleton()}</div>
  `;
  const grid = view.querySelector("#grid");
  try {
    const { products } = await api.productsByCategory(slug);
    grid.innerHTML = "";
    (products || []).forEach((p) => {
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
          <div class="card-price">${rupee(p.price)}</div>
        </div>`;
      card.addEventListener("click", () => go("product", { id: p.id }, { title: p.name }));
      grid.appendChild(card);
    });
    if (!products || !products.length) grid.innerHTML = `<div class="empty">No products in this category yet.</div>`;
  } catch (err) {
    grid.innerHTML = `<div class="empty">Couldn't load products.<br><span class="muted">${escapeHtml(err.message)}</span></div>`;
  }
}

function tileSkeleton() { return `<div class="tile skeleton" style="min-height:156px;border:none;"></div>`; }
function cardSkeleton() {
  return `<div class="card"><div class="thumb skeleton" style="aspect-ratio:3/4;"></div><div class="card-body"><div class="skeleton" style="height:12px;border-radius:6px;"></div><div class="skeleton" style="height:12px;width:50%;margin-top:8px;border-radius:6px;"></div></div></div>`;
}
