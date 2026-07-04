/* Catalog (landing) + category product grid */
import { api, go, rupee, escapeHtml } from "../app.js";

export async function render(view) {
  view.innerHTML = `
    <div class="hero">
      <div class="brand">Ram<em>ree</em></div>
      <div class="tag">Beautiful, on you. Discover, try on with AI, and shop.</div>
    </div>
    <div class="eyebrow" style="margin-top:8px;">Shop by category</div>
    <div class="tiles" id="tiles">
      ${tileSkeleton()}${tileSkeleton()}${tileSkeleton()}
    </div>
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
        </div>`;
      el.addEventListener("click", () => go("category", { slug: c.slug, name: c.name }, { title: c.name }));
      tiles.appendChild(el);
    });
    if (!categories || !categories.length) {
      tiles.innerHTML = `<div class="empty">No categories yet.</div>`;
    }
  } catch (err) {
    tiles.innerHTML = `<div class="empty">Couldn't load categories.<br><span class="muted">${escapeHtml(err.message)}</span></div>`;
  }
}

export async function renderCategory(view, { slug, name }) {
  view.innerHTML = `
    <div class="eyebrow">Category</div>
    <h1 class="display">${escapeHtml(name || "")}</h1>
    <div class="grid" id="grid">
      ${cardSkeleton()}${cardSkeleton()}${cardSkeleton()}${cardSkeleton()}
    </div>
  `;
  const grid = view.querySelector("#grid");
  try {
    const { products } = await api.productsByCategory(slug);
    grid.innerHTML = "";
    (products || []).forEach((p) => {
      const img = (p.images && p.images[0]) || "";
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <img class="thumb" src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" loading="lazy">
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

function tileSkeleton() { return `<div class="tile skeleton" style="min-height:150px;border:none;"></div>`; }
function cardSkeleton() {
  return `<div class="card"><div class="thumb skeleton"></div><div class="card-body"><div class="skeleton" style="height:12px;border-radius:6px;"></div><div class="skeleton" style="height:12px;width:50%;margin-top:8px;border-radius:6px;"></div></div></div>`;
}
