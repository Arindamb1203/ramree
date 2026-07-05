/* Product detail — advanced 360° viewer (drag + arrows + auto-spin),
   wishlist heart, and Try It On / Continue CTAs. */
import { api, state, go, onLeave, rupee, escapeHtml, toast } from "../app.js";

const CHEV_L = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEV_R = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const HEART = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0112 7a3.5 3.5 0 017 3.5C19 15.5 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>`;
const SPIN_ICON = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 8c5 0 9 1.8 9 4s-4 4-9 4-9-1.8-9-4a3.4 3.4 0 011-2.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 9.8L3 12l2.4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export async function render(view, { id }) {
  view.innerHTML = `<div class="loading"><div class="spinner"></div><div class="lb-sub">Loading…</div></div>`;

  let product;
  try {
    product = (await api.product(id)).product;
  } catch (err) {
    view.innerHTML = `<div class="empty">Couldn't load product.<br><span class="muted">${escapeHtml(err.message)}</span></div>`;
    return;
  }
  if (!product) { view.innerHTML = `<div class="empty">Product not found.</div>`; return; }

  state.product = product;
  let images = Array.isArray(product.images) ? product.images.slice() : [];
  const outOfStock = product.stock <= 0;
  const hasAngles = images.length > 1;

  view.innerHTML = `
    <div class="viewer" id="viewer">
      <div class="viewer-badge" id="badge">${SPIN_ICON} 360°</div>
      <button class="heart-btn" id="heart" aria-label="Add to wishlist">${HEART}</button>
      <img class="v-frame" id="frameA" src="${escapeHtml(images[0] || "")}" alt="${escapeHtml(product.name)}">
      <img class="v-frame" id="frameB" alt="" style="opacity:0">
      <button class="v-arrow left" id="prev" aria-label="Rotate left" ${hasAngles ? "" : "hidden"}>${CHEV_L}</button>
      <button class="v-arrow right" id="next" aria-label="Rotate right" ${hasAngles ? "" : "hidden"}>${CHEV_R}</button>
      ${hasAngles ? `<div class="rotate-hint" id="hint">${SPIN_ICON} Drag to rotate</div>` : ""}
    </div>
    <div class="dots" id="dots"></div>
    ${hasAngles ? `<div class="hint" style="text-align:center;margin-top:2px;">Rotate to explore · additional angles are AI-rendered approximations</div>` : `<div class="hint" id="prep" style="text-align:center;margin-top:2px;">${SPIN_ICON} Preparing 360° view…</div>`}

    <div class="pd-head">
      <div class="pd-name">${escapeHtml(product.name)}</div>
      <div class="pd-price">${rupee(product.price)}</div>
    </div>
    <div class="pd-desc">${escapeHtml(product.description || "")}</div>
    ${stockBadge(product.stock)}

    <div class="btn-row btn-2">
      <button class="btn btn-rose" id="tryon" ${outOfStock ? "disabled" : ""}>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
        Try It On
      </button>
      <button class="btn btn-primary" id="continue" ${outOfStock ? "disabled" : ""}>
        ${outOfStock ? "Sold out" : "Continue"}
      </button>
    </div>
  `;

  const viewer = setupViewer(view, images, hasAngles);

  // Wishlist heart → capture details, then save
  view.querySelector("#heart").addEventListener("click", () => {
    state.action = "wishlist";
    go("lead", { action: "wishlist" }, { title: "Wishlist" });
  });

  view.querySelector("#tryon").addEventListener("click", () => {
    if (outOfStock) return;
    state.action = "tryon";
    go("lead", { action: "tryon" }, { title: "Try It On" });
  });
  view.querySelector("#continue").addEventListener("click", () => {
    if (outOfStock) return;
    state.action = "buy";
    go("checkout", {}, { title: "Checkout" });
  });

  // Single-photo product → auto-generate angles (no button, per spec) and upgrade.
  if (!hasAngles) autoGenerate(view, product);
}

function stockBadge(stock) {
  if (stock <= 0) return `<div class="stock out"><span class="dot"></span> Out of stock</div>`;
  if (stock <= 3) return `<div class="stock low"><span class="dot"></span> Only ${stock} left</div>`;
  return `<div class="stock"><span class="dot"></span> In stock · ${stock} available</div>`;
}

/* Advanced viewer: drag-to-rotate + arrow steps + one intro auto-spin. */
function setupViewer(view, images, hasAngles) {
  const viewer = view.querySelector("#viewer");
  const layers = [view.querySelector("#frameA"), view.querySelector("#frameB")];
  const dots = view.querySelector("#dots");
  const n = images.length;
  let idx = 0;
  let top = 0;            // which layer is currently visible
  let introTimer = null;

  function renderDots() {
    if (!dots) return;
    dots.innerHTML = n > 1 ? images.map((_, i) => `<i class="${i === idx ? "on" : ""}"></i>`).join("") : "";
  }
  // Instant swap (used while dragging — must stay responsive).
  function show(i) {
    idx = ((i % n) + n) % n;
    layers[top].src = images[idx];
    layers[top].style.opacity = 1;
    layers[1 - top].style.opacity = 0;
    renderDots();
  }
  // Smooth crossfade (used by arrows + auto-spin — reads as slow rotation).
  function showFade(i) {
    idx = ((i % n) + n) % n;
    const back = 1 - top;
    layers[back].src = images[idx];
    requestAnimationFrame(() => {
      layers[back].style.opacity = 1;
      layers[top].style.opacity = 0;
      top = back;
    });
    renderDots();
  }
  renderDots();
  if (!hasAngles || n <= 1) return { show };

  function stopIntro() { if (introTimer) { clearInterval(introTimer); introTimer = null; } }

  // Arrows (must run BEFORE the drag handler; drag ignores taps on them).
  const prev = view.querySelector("#prev");
  const next = view.querySelector("#next");
  if (prev) prev.addEventListener("click", (e) => { e.stopPropagation(); stopIntro(); showFade(idx - 1); });
  if (next) next.addEventListener("click", (e) => { e.stopPropagation(); stopIntro(); showFade(idx + 1); });

  // Drag-to-rotate. No pointer capture (that stole taps from the arrows);
  // instead we listen on window during an active drag and clean up on leave.
  let dragging = false, startX = 0, startIdx = 0;
  const stepPx = 22;
  function onDown(e) {
    if (e.target.closest(".v-arrow") || e.target.closest(".heart-btn")) return;
    stopIntro(); dragging = true; startX = e.clientX; startIdx = idx;
    viewer.classList.add("dragging");
  }
  function onMove(e) { if (dragging) show(startIdx + Math.round((e.clientX - startX) / stepPx)); }
  function onUp() { if (dragging) { dragging = false; viewer.classList.remove("dragging"); } }
  viewer.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);

  // Intro auto-spin (gentle) once all frames are decoded (no blank flashes).
  Promise.all(images.map((src) => new Promise((res) => {
    const im = new Image(); im.onload = im.onerror = res; im.src = src;
  }))).then(() => {
    if (!viewerAlive()) return;
    let spins = 0; const total = n + 1;
    introTimer = setInterval(() => {
      if (!viewerAlive()) return stopIntro();
      showFade(idx + 1);
      if (++spins >= total) { stopIntro(); showFade(0); }
    }, 750);   // slow, cinematic cadence
  });

  function viewerAlive() { return document.body.contains(viewer); }

  onLeave(() => {
    stopIntro();
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  });

  return { show };
}

async function autoGenerate(view, product) {
  try {
    const res = await api.generateAngles(product.id);
    const gen = res.images || [];
    if (!gen.length) throw new Error("no angles");
    const all = [product.images[0], ...gen];
    state.product.images = all;
    // Rebuild the viewer area with the new frames + AI badge
    const badge = view.querySelector("#badge");
    if (badge) badge.classList.add("ai"), (badge.innerHTML = `${SPIN_ICON} 360° · AI`);
    view.querySelector("#prev").hidden = false;
    view.querySelector("#next").hidden = false;
    const prep = view.querySelector("#prep");
    if (prep) prep.textContent = "Rotate to explore · additional angles are AI-rendered approximations";
    setupViewer(view, all, true);
  } catch (e) {
    const prep = view.querySelector("#prep");
    if (prep) prep.remove();
    const badge = view.querySelector("#badge");
    if (badge) badge.remove();
  }
}
