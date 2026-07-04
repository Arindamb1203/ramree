/* Shared WhatsApp follow-up (demo deep link) + opt-out control.
   Mounts into a container element. Uses state.lead for the number/name. */
import { api, state, toast } from "./app.js";

const APP_URL = "https://ramree.pages.dev";

export function whatsappBlock() {
  const lead = state.lead || {};
  const name = lead.name || "there";
  const num = lead.whatsapp_number || "";
  const text = `Hi ${name}! Thanks for shopping with Ramree ✨ Try on outfits with AI and shop your favourites here: ${APP_URL}`;
  const waLink = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;

  const wrap = document.createElement("div");
  wrap.className = "wa-block";
  wrap.innerHTML = `
    <a class="btn wa-btn" id="waBtn" href="${waLink}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2a10 10 0 00-8.5 15.2L2 22l4.9-1.4A10 10 0 1012 2zm5.3 14.1c-.2.6-1.2 1.1-1.7 1.2-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.6-.6a9 9 0 01-3.4-3c-.7-.9-1.1-1.9-1.2-2.2-.1-.3 0-.6.2-.8l.5-.6c.1-.2.2-.3.3-.5s0-.4 0-.5l-.7-1.6c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.8 4.4 3.9 2.6 1.1 2.6.7 3.1.7.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.1-.4-.2z" fill="currentColor"/></svg>
      Get the invite on WhatsApp
    </a>
    <div class="hint">Demo: this opens WhatsApp with a pre-filled invite message — nothing is sent automatically.</div>

    <div class="optout">
      <div class="ot-label">Stop receiving messages from Ramree</div>
      <label class="switch">
        <input type="checkbox" id="optout">
        <span class="track"></span>
      </label>
    </div>
  `;

  const cb = wrap.querySelector("#optout");
  cb.addEventListener("change", async () => {
    try {
      await api.optOut(num, cb.checked ? 1 : 0);
      toast(cb.checked ? "You've opted out of messages" : "You'll receive messages again");
    } catch (err) {
      toast(err.message || "Couldn't update preference");
      cb.checked = !cb.checked;
    }
  });

  return wrap;
}
