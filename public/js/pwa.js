/* PWA install experience.
   On first visit shows an "Install Ramree" sheet with Install / Skip.
   - Android / Chromium: uses the native beforeinstallprompt (one-tap install).
   - iOS Safari / others: shows the manual Add-to-Home-Screen steps, since those
     browsers don't expose a programmatic install. */

const DISMISS_KEY = "ramree_install_v1";
const RENAG_MS = 7 * 24 * 60 * 60 * 1000; // re-offer to "Skip" users after 7 days

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e; // stash so our Install button can trigger it on a user gesture
});

// Register the service worker (required for install eligibility).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

window.addEventListener("appinstalled", () => {
  try { localStorage.setItem(DISMISS_KEY, "installed"); } catch (e) {}
  removeSheet();
});

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function removeSheet() {
  const el = document.getElementById("pwaSheet");
  if (el) el.remove();
}

function showSheet() {
  if (document.getElementById("pwaSheet") || isStandalone()) return;
  const ios = isIOS();

  const wrap = document.createElement("div");
  wrap.id = "pwaSheet";
  wrap.className = "pwa-overlay";
  wrap.innerHTML = `
    <div class="pwa-sheet" role="dialog" aria-modal="true" aria-label="Install Ramree">
      <img class="pwa-icon" src="/icons/icon-192.png" alt="Ramree" width="66" height="66">
      <div class="display pwa-title">Install Ramree</div>
      <p class="lead pwa-sub">Add Ramree to your home screen for a faster, full-screen, app-like experience — one tap to open, just like a store app.</p>
      <div class="pwa-steps" id="pwaSteps" hidden></div>
      <div class="pwa-btns">
        <button class="btn btn-primary" id="pwaInstall">Install</button>
        <button class="btn btn-ghost" id="pwaSkip">Skip</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const skip = () => {
    try { localStorage.setItem(DISMISS_KEY, "skipped:" + Date.now()); } catch (e) {}
    removeSheet();
  };
  wrap.querySelector("#pwaSkip").addEventListener("click", skip);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) skip(); });

  const installBtn = wrap.querySelector("#pwaInstall");
  installBtn.onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null;
      removeSheet();
      return;
    }
    // No native prompt (iOS, or criteria not yet met) → show manual steps.
    const steps = wrap.querySelector("#pwaSteps");
    steps.hidden = false;
    steps.innerHTML = ios
      ? `Tap the <b>Share</b> button <span class="pwa-kbd">&#x2191;</span> at the bottom of Safari, then choose <b>“Add to Home Screen”</b>.`
      : `Open your browser menu <b>&#8942;</b> (top-right), then tap <b>“Install app”</b> or <b>“Add to Home screen”</b>.`;
    installBtn.textContent = "Got it";
    installBtn.onclick = removeSheet;
  };
}

function maybeShow() {
  if (isStandalone()) return;
  let dismissed = null;
  try { dismissed = localStorage.getItem(DISMISS_KEY); } catch (e) {}
  if (dismissed === "installed") return;
  if (dismissed && dismissed.indexOf("skipped:") === 0) {
    const t = parseInt(dismissed.slice("skipped:".length), 10) || 0;
    if (Date.now() - t < RENAG_MS) return;
  }
  setTimeout(showSheet, 900); // let the first screen paint, then invite
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", maybeShow);
} else {
  maybeShow();
}
