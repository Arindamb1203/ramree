/* Buy — demo payment screen with a QR code (no real gateway) */
import { api, state, go, backTo, toast, rupee, escapeHtml } from "../app.js";
import { whatsappBlock } from "../wa.js";

// Demo UPI target for the QR (not a live merchant — display only).
const UPI_ID = "ramree@demo";
const PAYEE = "Ramree";

export async function render(view) {
  const p = state.product, lead = state.lead;
  const co = state.checkout || { qty: 1 };
  const qty = co.qty || 1;
  const amount = p ? p.price * qty : 0;

  // Build a UPI deep link and render it as a QR via a public QR image service (demo).
  const upi = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(PAYEE)}&am=${amount}&cu=INR&tn=${encodeURIComponent("Ramree order")}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(upi)}`;

  view.innerHTML = `
    <div class="eyebrow">Payment · Demo</div>
    <h1 class="display" style="font-size:30px;">Scan to pay</h1>
    <div class="lead">${escapeHtml(p ? p.name : "")}${qty > 1 ? ` · Qty ${qty}` : ""}</div>

    <div class="qr-wrap">
      <div class="qr-card"><img src="${qrSrc}" alt="Payment QR" width="220" height="220"></div>
    </div>
    <div class="pay-amt">${rupee(amount)}</div>
    <div class="pay-note">Demo only — this QR does not charge any real money.</div>

    <div class="btn-row">
      <button class="btn btn-primary" id="paid">I've paid — confirm order</button>
    </div>
    <div id="after" hidden></div>
  `;

  const paidBtn = view.querySelector("#paid");
  paidBtn.addEventListener("click", async () => {
    paidBtn.disabled = true;
    paidBtn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>`;
    try {
      const res = await api.createOrder({
        whatsapp_number: lead.whatsapp_number,
        product_id: p.id,
        qty,
        amount,
        address: co.address || "",
      });
      if (res && typeof res.stock === "number") state.product.stock = res.stock;
      showConfirmed(view, res && res.order_id);
    } catch (err) {
      toast(err.message || "Couldn't confirm order");
      paidBtn.disabled = false;
      paidBtn.textContent = "I've paid — confirm order";
    }
  });
}

function showConfirmed(view, orderId) {
  view.querySelector(".qr-wrap").remove();
  view.querySelector(".pay-amt").remove();
  view.querySelector(".pay-note").remove();
  view.querySelector("#paid").closest(".btn-row").remove();

  const after = view.querySelector("#after");
  after.hidden = false;
  after.innerHTML = `
    <div class="panel center">
      <div class="big-check">
        <svg viewBox="0 0 24 24" width="34" height="34"><path d="M5 13l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h1 class="section-title" style="margin:0;">Order confirmed</h1>
      <div class="lead" style="margin-top:6px;">${orderId ? "Order #" + escapeHtml(orderId.slice(0, 8)) : "Thank you for your purchase."}</div>
      <div id="waMount"></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-ghost" id="home">Back to catalog</button>
    </div>
  `;
  after.querySelector("#waMount").appendChild(whatsappBlock());
  after.querySelector("#home").addEventListener("click", () => backTo("catalog"));
}
