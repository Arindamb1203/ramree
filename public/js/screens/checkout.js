/* Checkout — quantity, contact (name + WhatsApp), delivery address, summary → payment */
import { api, state, go, toast, rupee, escapeHtml } from "../app.js";

export async function render(view) {
  const p = state.product;
  if (!p) { view.innerHTML = `<div class="empty">No item selected.</div>`; return; }

  const pre = state.lead || {};
  const preC = state.checkout || {};
  const img = (p.images && p.images[0]) || "";
  let qty = Math.min(Math.max(1, preC.qty || 1), Math.max(1, p.stock));

  view.innerHTML = `
    <div class="eyebrow">Checkout</div>
    <h1 class="display" style="font-size:30px;">Your order</h1>

    <div class="summary">
      <div class="s-item">
        <img src="${escapeHtml(img)}" alt="">
        <div style="flex:1;">
          <div class="s-name">${escapeHtml(p.name)}</div>
          <div class="s-meta">${rupee(p.price)} each · ${p.stock} in stock</div>
        </div>
        <div class="qty" id="qty">
          <button id="minus" aria-label="Decrease">−</button>
          <div class="qv" id="qv">${qty}</div>
          <button id="plus" aria-label="Increase">+</button>
        </div>
      </div>
      <div class="s-total">
        <span class="lbl">Total</span>
        <span class="amt" id="total">${rupee(p.price * qty)}</span>
      </div>
    </div>

    <div class="field">
      <label for="nm">Full name</label>
      <input class="input" id="nm" type="text" autocomplete="name" placeholder="e.g. Aditi Rai" value="${escapeHtml(pre.name || "")}">
    </div>
    <div class="field">
      <label for="wa">WhatsApp number</label>
      <div class="phone-row">
        <input class="input cc" id="cc" type="text" inputmode="numeric" value="+91" aria-label="Country code">
        <input class="input" id="wa" type="tel" inputmode="numeric" autocomplete="tel" placeholder="10-digit number" value="${escapeHtml(pre.local || "")}">
      </div>
    </div>
    <div class="field">
      <label for="addr">Delivery address</label>
      <textarea class="textarea" id="addr" rows="3" placeholder="House / flat, street, area">${escapeHtml(preC.addr || "")}</textarea>
    </div>
    <div class="field two-col">
      <div>
        <label for="city">City / Town</label>
        <input class="input" id="city" type="text" placeholder="Kurseong" value="${escapeHtml(preC.city || "")}">
      </div>
      <div>
        <label for="pin">PIN code</label>
        <input class="input" id="pin" type="text" inputmode="numeric" placeholder="734203" value="${escapeHtml(preC.pin || "")}">
      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-gold" id="pay">Proceed to Payment · <span id="btnTotal">${rupee(p.price * qty)}</span></button>
    </div>
    <div class="hint">Demo store — payment is shown as a QR only, no real charge.</div>
  `;

  const qv = view.querySelector("#qv");
  const total = view.querySelector("#total");
  const btnTotal = view.querySelector("#btnTotal");
  function refresh() {
    qv.textContent = qty;
    total.textContent = rupee(p.price * qty);
    btnTotal.textContent = rupee(p.price * qty);
  }
  view.querySelector("#minus").addEventListener("click", () => { if (qty > 1) { qty--; refresh(); } });
  view.querySelector("#plus").addEventListener("click", () => { if (qty < p.stock) { qty++; refresh(); } else toast(`Only ${p.stock} in stock`); });

  view.querySelector("#pay").addEventListener("click", async () => {
    const name = view.querySelector("#nm").value.trim();
    const local = view.querySelector("#wa").value.replace(/\D/g, "");
    const ccv = view.querySelector("#cc").value.replace(/[^\d]/g, "");
    const addr = view.querySelector("#addr").value.trim();
    const city = view.querySelector("#city").value.trim();
    const pin = view.querySelector("#pin").value.replace(/\D/g, "");

    if (!name) return toast("Please enter your name");
    if (local.length < 7) return toast("Please enter a valid WhatsApp number");
    if (!addr || !city) return toast("Please enter your delivery address");

    const whatsapp_number = (ccv || "91") + local;
    const btn = view.querySelector("#pay");
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>`;
    try {
      await api.saveLead({ name, whatsapp_number });
      state.lead = { name, whatsapp_number, local };
      state.checkout = { qty, addr, city, pin, address: fullAddress(addr, city, pin) };
      go("buy", {}, { title: "Payment" });
    } catch (err) {
      toast(err.message || "Couldn't continue");
      btn.disabled = false;
      btn.innerHTML = `Proceed to Payment · ${rupee(p.price * qty)}`;
    }
  });
}

function fullAddress(addr, city, pin) {
  return [addr, city, pin].filter(Boolean).join(", ");
}
