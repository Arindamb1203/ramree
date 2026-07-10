/* Name + WhatsApp capture — common step before wishlist / buy / try-on */
import { api, state, go, toast, escapeHtml } from "../app.js";

const ACTION_LABEL = { tryon: "start your AI try-on", wishlist: "save to wishlist" };
const ACTION_TITLE = { tryon: "Before we begin", wishlist: "Save your pick" };

export async function render(view, { action }) {
  const pre = state.lead || {};
  view.innerHTML = `
    <div class="eyebrow">Your details</div>
    <h1 class="display" style="font-size:30px;">${ACTION_TITLE[action] || "A few details"}</h1>
    <div class="lead">We'll use your WhatsApp number to ${ACTION_LABEL[action] || "continue"} and keep your ${action === "wishlist" ? "wishlist" : "session"} handy.</div>

    <div class="field">
      <label for="nm">Your name</label>
      <input class="input" id="nm" type="text" autocomplete="name" placeholder="e.g. Aditi" value="${escapeHtml(pre.name || "")}">
    </div>
    <div class="field">
      <label for="wa">WhatsApp number</label>
      <div class="phone-row">
        <input class="input cc" id="cc" type="text" inputmode="numeric" value="+91" maxlength="4" aria-label="Country code">
        <input class="input" id="wa" type="tel" inputmode="numeric" autocomplete="tel" placeholder="10-digit number" maxlength="10" value="${escapeHtml((pre.local || ""))}">
      </div>
      <div class="hint">Standard privacy applies. You can opt out of messages anytime on the next screen.</div>
    </div>

    <div class="btn-row">
      <button class="btn btn-primary" id="go">Continue</button>
    </div>
  `;

  const nm = view.querySelector("#nm");
  const cc = view.querySelector("#cc");
  const wa = view.querySelector("#wa");
  const btn = view.querySelector("#go");

  // Number field: local digits only. Auto-strip a pasted/typed country code
  // (+91 / 91) or trunk 0 so only the 10-digit local number remains.
  wa.addEventListener("input", () => {
    let v = wa.value.replace(/\D/g, "");
    if (v.length > 10) {
      if (v.startsWith("91")) v = v.slice(2);
      else if (v.startsWith("0")) v = v.replace(/^0+/, "");
    }
    wa.value = v.slice(0, 10);
  });
  // Country code box: keep it a leading "+" followed by up to 3 digits.
  cc.addEventListener("input", () => {
    cc.value = "+" + cc.value.replace(/\D/g, "").slice(0, 3);
  });

  btn.addEventListener("click", async () => {
    const name = nm.value.trim();
    const local = wa.value.replace(/\D/g, "");
    const ccv = cc.value.replace(/[^\d+]/g, "").replace(/^\+?/, "");
    if (!name) return toast("Please enter your name");
    if (local.length < 7) return toast("Please enter a valid WhatsApp number");

    const whatsapp_number = (ccv || "91") + local;

    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>`;
    try {
      await api.saveLead({ name, whatsapp_number });
      state.lead = { name, whatsapp_number, local };
      routeByAction(action);
    } catch (err) {
      toast(err.message || "Couldn't save details");
      btn.disabled = false;
      btn.textContent = "Continue";
    }
  });
}

function routeByAction(action) {
  if (action === "wishlist") return go("wishlistConfirm", {}, { title: "Wishlist" });
  if (action === "tryon") return go("tryonCamera", {}, { title: "Try It On" });
  // buy is handled by the checkout screen, not here
  return go("checkout", {}, { title: "Checkout" });
}
