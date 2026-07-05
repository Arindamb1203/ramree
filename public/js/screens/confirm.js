/* Confirmation screens: wishlist saved, and post-try-on buy/wishlist choice */
import { api, state, go, backTo, toast, escapeHtml } from "../app.js";
import { whatsappBlock } from "../wa.js";

export async function renderWishlist(view) {
  const p = state.product, lead = state.lead;
  view.innerHTML = `
    <div class="panel center">
      <div class="big-check">
        <svg viewBox="0 0 24 24" width="34" height="34"><path d="M5 13l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h1 class="section-title" style="margin:0;">Saved to your wishlist</h1>
      <div class="lead" style="margin-top:6px;">${escapeHtml(p ? p.name : "Item")} is saved under your WhatsApp number.</div>
      <div id="waMount"></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-ghost" id="home">Back to catalog</button>
    </div>
  `;

  try {
    await api.addWishlist({ whatsapp_number: lead.whatsapp_number, product_id: p.id });
  } catch (err) {
    toast(err.message || "Couldn't save to wishlist");
  }

  view.querySelector("#waMount").appendChild(whatsappBlock());
  view.querySelector("#home").addEventListener("click", () => backTo("catalog"));
}

/* Shown after a liked try-on: Buy or Wishlist (no Try On) */
export async function renderPostBuy(view) {
  const p = state.product;
  view.innerHTML = `
    <div class="eyebrow">Love it?</div>
    <h1 class="display" style="font-size:30px;">Make it yours</h1>
    <div class="lead">${escapeHtml(p ? p.name : "")}</div>
    <div class="actions">
      <div class="action-card" data-key="buy">
        <div class="ac-ic"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M6 7h12l-1 12H7L6 7zm3 0a3 3 0 016 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div><div class="ac-title">Buy</div><div class="ac-sub">Checkout in seconds</div></div>
        <div class="ac-arrow"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      </div>
      <div class="action-card" data-key="wishlist">
        <div class="ac-ic"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0112 7a3.5 3.5 0 017 3.5C19 15.5 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
        <div><div class="ac-title">Add to Wishlist</div><div class="ac-sub">Save it for later</div></div>
        <div class="ac-arrow"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      </div>
    </div>
  `;
  view.querySelectorAll(".action-card").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.key;
      state.action = key;
      // Lead already captured earlier in the flow.
      if (key === "buy") go("checkout", {}, { title: "Checkout" });
      else go("wishlistConfirm", {}, { title: "Wishlist" });
    });
  });
}
