/* Product detail — 360° drag viewer, or AI-generated angle views for single-photo items */
import { api, state, go, rupee, escapeHtml, toast } from "../app.js";

export async function render(view, { id }) {
  view.innerHTML = `<div class="loading"><div class="spinner"></div><div class="lb-sub">Loading…</div></div>`;

  let product;
  try {
    const res = await api.product(id);
    product = res.product;
  } catch (err) {
    view.innerHTML = `<div class="empty">Couldn't load product.<br><span class="muted">${escapeHtml(err.message)}</span></div>`;
    return;
  }
  if (!product) { view.innerHTML = `<div class="empty">Product not found.</div>`; return; }

  state.product = product;
  const images = Array.isArray(product.images) ? product.images.slice() : [];
  const multi = images.length > 1;
  const outOfStock = product.stock <= 0;

  view.innerHTML = `
    <div class="viewer" id="viewer">
      <div class="viewer-badge${multi ? "" : ""}" id="badge" ${multi ? "" : 'hidden'}>
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 0v18M3 12h18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
        360°
      </div>
      <img id="frame" src="${escapeHtml(images[0] || "")}" alt="${escapeHtml(product.name)}">
      ${multi ? `<div class="rotate-hint"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 12a8 8 0 018-8M20 12a8 8 0 01-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg> Drag to rotate</div>` : ""}
    </div>
    <div class="dots" id="dots"></div>

    <div class="pd-head">
      <div class="pd-name">${escapeHtml(product.name)}</div>
      <div class="pd-price">${rupee(product.price)}</div>
    </div>
    <div class="pd-desc">${escapeHtml(product.description || "")}</div>
    ${stockBadge(product.stock)}

    ${!multi ? `
      <div class="btn-row">
        <button class="btn btn-ghost" id="genBtn">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8l4.4-1.4L12 2z" fill="currentColor"/></svg>
          Generate 360° view with AI
        </button>
      </div>
      <div class="hint">AI-rendered views are generative approximations of other angles — not photographs of the actual garment's back or sides.</div>
    ` : ""}

    <div class="btn-row">
      <button class="btn btn-primary" id="continueBtn" ${outOfStock ? "disabled" : ""}>
        ${outOfStock ? "Out of stock" : "Continue"}
      </button>
    </div>
  `;

  setupViewer(view, images, multi);

  const genBtn = view.querySelector("#genBtn");
  if (genBtn) {
    genBtn.addEventListener("click", async () => {
      genBtn.disabled = true;
      genBtn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Rendering angles…`;
      try {
        const res = await api.generateAngles(product.id);
        const gen = res.images || [];
        const all = images.concat(gen);           // original first, then AI angles
        state.product.images = all;
        state.product.aiAngles = true;
        // rebuild viewer with AI badge
        rebuildAsAiViewer(view, all);
        toast("AI angle views ready");
      } catch (err) {
        toast(err.message || "Generation failed");
        genBtn.disabled = false;
        genBtn.innerHTML = `Generate 360° view with AI`;
      }
    });
  }

  view.querySelector("#continueBtn").addEventListener("click", () => {
    if (product.stock <= 0) return;
    go("actions", { id: product.id }, { title: product.name });
  });
}

function stockBadge(stock) {
  if (stock <= 0) return `<div class="stock out"><span class="dot"></span> Out of stock</div>`;
  if (stock <= 3) return `<div class="stock low"><span class="dot"></span> Only ${stock} left</div>`;
  return `<div class="stock"><span class="dot"></span> In stock · ${stock} available</div>`;
}

/* Drag-to-rotate across image frames */
function setupViewer(view, images, multi) {
  const viewer = view.querySelector("#viewer");
  const frame = view.querySelector("#frame");
  const dots = view.querySelector("#dots");
  let idx = 0;
  const n = images.length;

  function renderDots() {
    if (!dots) return;
    if (n <= 1) { dots.innerHTML = ""; return; }
    dots.innerHTML = images.map((_, i) => `<i class="${i === idx ? "on" : ""}"></i>`).join("");
  }
  function show(i) {
    idx = ((i % n) + n) % n;
    frame.src = images[idx];
    renderDots();
  }
  renderDots();

  if (n <= 1) return;

  let dragging = false, startX = 0, startIdx = 0;
  const stepPx = 26; // px of drag per frame change

  function down(x) { dragging = true; startX = x; startIdx = idx; viewer.classList.add("dragging"); }
  function move(x) {
    if (!dragging) return;
    const delta = Math.round((x - startX) / stepPx);
    show(startIdx + delta);
  }
  function up() { dragging = false; viewer.classList.remove("dragging"); }

  viewer.addEventListener("pointerdown", (e) => { down(e.clientX); viewer.setPointerCapture(e.pointerId); });
  viewer.addEventListener("pointermove", (e) => move(e.clientX));
  viewer.addEventListener("pointerup", up);
  viewer.addEventListener("pointercancel", up);
}

function rebuildAsAiViewer(view, images) {
  const viewer = view.querySelector("#viewer");
  viewer.innerHTML = `
    <div class="viewer-badge ai" id="badge">
      <svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8l4.4-1.4L12 2z" fill="currentColor"/></svg>
      AI-rendered view
    </div>
    <img id="frame" src="${escapeHtml(images[0])}" alt="">
    <div class="rotate-hint"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 12a8 8 0 018-8M20 12a8 8 0 01-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg> Drag to rotate</div>
  `;
  // remove the generate button
  const gb = view.querySelector("#genBtn");
  if (gb) gb.closest(".btn-row").remove();
  setupViewer(view, images, true);
}
