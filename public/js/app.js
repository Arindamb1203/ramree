/* ==========================================================
   Ramree — SPA core: navigation stack, shared state, screens
   ========================================================== */
import { api } from "./api.js";
import * as catalog from "./screens/catalog.js";   // home + category — loaded eagerly
// Every other screen is loaded ON DEMAND (dynamic import) so the first paint
// only downloads app.js + api.js + catalog.js instead of the whole app.

/* ── Shared app state (in-memory only; try-on photos never persisted) ── */
export const state = {
  product: null,     // currently viewed product
  action: null,      // 'wishlist' | 'buy' | 'tryon'
  lead: null,        // { name, whatsapp_number, local }
  checkout: null,    // { qty, address }
};

/* ── DOM refs ── */
const stage = document.getElementById("stage");
const topbar = document.getElementById("topbar");
const topbarTitle = document.getElementById("topbarTitle");
const backBtn = document.getElementById("backBtn");
const toastEl = document.getElementById("toast");

/* ── Screen registry ── each entry returns the render fn (dynamically importing
   its module the first time it's needed; the browser caches it after). ── */
const screenLoaders = {
  catalog:         () => catalog.render,
  category:        () => catalog.renderCategory,
  product:         async () => (await import("./screens/product.js")).render,
  lead:            async () => (await import("./screens/lead.js")).render,
  wishlistConfirm: async () => (await import("./screens/confirm.js")).renderWishlist,
  postBuy:         async () => (await import("./screens/confirm.js")).renderPostBuy,
  checkout:        async () => (await import("./screens/checkout.js")).render,
  buy:             async () => (await import("./screens/buy.js")).render,
  tryonCamera:     async () => (await import("./screens/tryon.js")).renderCamera,
  tryonResult:     async () => (await import("./screens/tryon.js")).renderResult,
};

/* ── Navigation stack ──
   Mirrored into the browser history so the phone's Back button (and swipe-back)
   does exactly what the in-app Back arrow does: one popstate = one screen back. */
const stack = [];   // [{ name, params, title, root }]

export function go(name, params = {}, opts = {}) {
  stack.push({ name, params, title: opts.title || "Ramree", root: !!opts.root });
  history.pushState({ depth: stack.length }, "");
  render();
}

export function replace(name, params = {}, opts = {}) {
  if (stack.length) stack.pop();
  stack.push({ name, params, title: opts.title || "Ramree", root: !!opts.root });
  history.replaceState({ depth: stack.length }, "");
  render();
}

/* Both the site Back arrow and the OS Back button funnel through the browser
   history; the actual stack pop + render happens in the popstate handler. */
export function back() {
  if (stack.length <= 1) return;
  history.back();
}

/* Pop back to a named screen (or root if not found). */
export function backTo(name) {
  let n = 0;
  for (let i = stack.length - 1; i > 0 && stack[i].name !== name; i--) n++;
  if (n > 0) history.go(-n);   // one popstate fires for the final entry
  else render();
}

window.addEventListener("popstate", () => {
  const targetDepth = (history.state && history.state.depth) || 1;
  while (stack.length > targetDepth) stack.pop();
  render();
});

async function render() {
  const cur = stack[stack.length - 1];
  if (!cur) return;

  // Topbar
  topbarTitle.textContent = cur.title;
  topbar.hidden = false;
  backBtn.style.visibility = stack.length > 1 ? "visible" : "hidden";

  // Let the outgoing screen clean up (e.g. stop camera)
  if (stage._cleanup) { try { stage._cleanup(); } catch (e) {} stage._cleanup = null; }

  stage.innerHTML = "";
  const loader = screenLoaders[cur.name];
  if (!loader) { stage.innerHTML = `<div class="empty">Screen not found.</div>`; return; }

  const view = document.createElement("section");
  view.className = "screen";
  stage.appendChild(view);
  try {
    const fn = await loader();           // dynamic import on first use, cached after
    await fn(view, cur.params);
  } catch (err) {
    view.innerHTML = `<div class="empty">Something went wrong.<br><span class="muted">${escapeHtml(err.message || "")}</span></div>`;
  }
  window.scrollTo(0, 0);
}

/* ── Shared UI helpers (exported for screens) ── */
export function rupee(n) { return "₹" + Number(n).toLocaleString("en-IN"); }

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

let toastTimer;
export function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

/* Register a cleanup fn for the current screen (called on next navigation) */
export function onLeave(fn) { stage._cleanup = fn; }

export { api };

/* ── Boot ── */
backBtn.addEventListener("click", back);

// Prevent long-press context menu app-wide (screenshot deterrent on result image
// specifically; harmless elsewhere for the app-like feel).
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".result-wrap")) e.preventDefault();
});

// Seed the first screen as the root history entry (replaceState, no extra entry
// to "back" through) so OS-back from the home screen exits cleanly.
stack.push({ name: "catalog", params: {}, title: "Ramree", root: true });
history.replaceState({ depth: 1 }, "");
render();

// After the home screen is up, quietly warm the most likely next screen so the
// first tap into a product is instant. Never blocks the initial paint.
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
idle(() => { import("./screens/product.js").catch(() => {}); });
