/* ==========================================================
   Ramree — SPA core: navigation stack, shared state, screens
   ========================================================== */
import { api } from "./api.js";
import * as catalog from "./screens/catalog.js";
import * as product from "./screens/product.js";
import * as actions from "./screens/actions.js";
import * as lead from "./screens/lead.js";
import * as confirm from "./screens/confirm.js";
import * as buy from "./screens/buy.js";
import * as tryon from "./screens/tryon.js";

/* ── Shared app state (in-memory only; try-on photos never persisted) ── */
export const state = {
  product: null,     // currently viewed product
  action: null,      // 'wishlist' | 'buy' | 'tryon'
  lead: null,        // { name, whatsapp_number }
};

/* ── DOM refs ── */
const stage = document.getElementById("stage");
const topbar = document.getElementById("topbar");
const topbarTitle = document.getElementById("topbarTitle");
const backBtn = document.getElementById("backBtn");
const toastEl = document.getElementById("toast");

/* ── Screen registry ── */
const screens = {
  catalog: catalog.render,
  category: catalog.renderCategory,
  product: product.render,
  actions: actions.render,
  lead: lead.render,
  wishlistConfirm: confirm.renderWishlist,
  postBuy: confirm.renderPostBuy,          // buy/wishlist choice after a liked try-on
  buy: buy.render,
  tryonCamera: tryon.renderCamera,
  tryonResult: tryon.renderResult,
};

/* ── Navigation stack ── */
const stack = [];   // [{ name, params, title, root }]

export function go(name, params = {}, opts = {}) {
  stack.push({ name, params, title: opts.title || "Ramree", root: !!opts.root });
  render();
}

export function replace(name, params = {}, opts = {}) {
  if (stack.length) stack.pop();
  go(name, params, opts);
}

export function back() {
  if (stack.length <= 1) return;
  stack.pop();
  render();
}

/* Pop back to a named screen (or root if not found) */
export function backTo(name) {
  while (stack.length > 1 && stack[stack.length - 1].name !== name) stack.pop();
  render();
}

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
  const fn = screens[cur.name];
  if (!fn) { stage.innerHTML = `<div class="empty">Screen not found.</div>`; return; }

  const view = document.createElement("section");
  view.className = "screen";
  stage.appendChild(view);
  try {
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

go("catalog", {}, { title: "Ramree", root: true });
