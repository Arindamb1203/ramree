/* Action choice: Try It On / Buy / Add to Wishlist */
import { state, go, escapeHtml } from "../app.js";

const ACTIONS = [
  {
    key: "tryon", title: "Try It On", sub: "See it on you with AI",
    icon: `<path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  },
  {
    key: "buy", title: "Buy", sub: "Checkout in seconds",
    icon: `<path d="M6 7h12l-1 12H7L6 7zm3 0a3 3 0 016 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    key: "wishlist", title: "Add to Wishlist", sub: "Save it for later",
    icon: `<path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0112 7a3.5 3.5 0 017 3.5C19 15.5 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`,
  },
];

export async function render(view) {
  const p = state.product;
  view.innerHTML = `
    <div class="eyebrow">Selected</div>
    <h1 class="display" style="font-size:30px;">${escapeHtml(p ? p.name : "")}</h1>
    <div class="lead">What would you like to do?</div>
    <div class="actions">
      ${ACTIONS.map(actionCard).join("")}
    </div>
  `;
  view.querySelectorAll(".action-card").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.key;
      state.action = key;
      go("lead", { action: key }, { title: "Almost there" });
    });
  });
}

function actionCard(a) {
  return `
    <div class="action-card" data-key="${a.key}">
      <div class="ac-ic"><svg viewBox="0 0 24 24" width="26" height="26">${a.icon}</svg></div>
      <div>
        <div class="ac-title">${a.title}</div>
        <div class="ac-sub">${a.sub}</div>
      </div>
      <div class="ac-arrow"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    </div>`;
}
