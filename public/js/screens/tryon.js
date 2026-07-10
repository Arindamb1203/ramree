/* Try-On: pose-guided camera capture → AI compositing → protected result.
   The captured photo lives ONLY in memory (module variable) and is cleared
   after generation. It is never written to D1 or disk. */
import { api, state, go, backTo, onLeave, toast, escapeHtml } from "../app.js";
import { loadPoseDetector, estimate, analyze, disposeDetector } from "../pose.js";
import { whatsappBlock } from "../wa.js";

// In-memory capture only. Cleared after use.
let capturedDataUrl = null;

/* Downscale a picked file to a JPEG data URL (kept only in memory, like a capture). */
function fileToDataUrl(file, max = 1080, q = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
      else if (h >= w && h > max) { w = Math.round(w * max / h); h = max; }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(u); resolve(c.toDataURL("image/jpeg", q));
    };
    img.onerror = () => { URL.revokeObjectURL(u); reject(new Error("Bad image")); };
    img.src = u;
  });
}

/* Which framing a garment needs. Upper garments (t-shirts, tops) only need the
   head + torso; kurti sets and anything full-length need the whole body. */
function framingScope(product) {
  const cat = (product && product.category ? product.category : "").toLowerCase();
  if (/tshirt|t-shirt|top|shirt|blouse/.test(cat)) return "upper";
  return "full";
}

/* ── Camera + pose guide ─────────────────────────────── */
export async function renderCamera(view) {
  const scope = framingScope(state.product);
  const upper = scope === "upper";
  const heading = upper ? "Frame your upper body" : "Stand in frame";
  const lead = upper
    ? "Head and shoulders centred and upright, in good light. We'll capture automatically when you're set."
    : "Full body, centered and upright, in good light. We'll capture automatically when you're set.";

  view.innerHTML = `
    <div class="eyebrow">Try It On</div>
    <h1 class="display" style="font-size:28px;">${heading}</h1>
    <div class="lead" style="margin-bottom:14px;">${lead}</div>

    <div class="cam-wrap" id="camWrap">
      <video id="video" playsinline muted autoplay></video>
      <div class="pose-guide${upper ? " upper" : ""}" id="guide"><div class="frame"></div></div>
      <div class="cam-feedback" id="fb">Starting camera…</div>
    </div>

    <div class="cam-actions">
      <button class="btn btn-rose" id="capture" disabled>Hold your pose…</button>
      <button class="btn btn-ghost" id="uploadBtn">Upload a photo instead</button>
      <input type="file" id="uploadInput" accept="image/*" hidden>
      <div class="hint">Your photo is processed to create the look and then discarded — it is never stored.</div>
    </div>
  `;

  const video = view.querySelector("#video");
  const guide = view.querySelector("#guide");
  const fb = view.querySelector("#fb");
  const captureBtn = view.querySelector("#capture");
  const uploadBtn = view.querySelector("#uploadBtn");
  const uploadInput = view.querySelector("#uploadInput");

  // Upload-from-gallery: skip the live camera entirely with an existing photo.
  uploadBtn.addEventListener("click", () => uploadInput.click());
  uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) return;
    try {
      capturedDataUrl = await fileToDataUrl(file);
      cleanup();
      go("tryonResult", {}, { title: "Your look" });
    } catch (e) {
      toast("Couldn't read that image — try another");
    }
  });

  let stream = null;
  let raf = null;
  let running = true;
  let lastRun = 0;
  let goodSince = 0;
  const startedAt = performance.now();
  const MANUAL_AFTER = 7000; // ms: if no auto-lock, let the user capture manually
  let manualEnabled = false;
  const sampler = document.createElement("canvas");
  const sctx = sampler.getContext("2d", { willReadFrequently: true });

  // Never leave the customer stuck: after a while, offer a manual capture.
  function enableManual() {
    if (manualEnabled) return;
    manualEnabled = true;
    captureBtn.disabled = false;
    captureBtn.textContent = "Capture now";
    captureBtn.onclick = () => { running = false; if (raf) cancelAnimationFrame(raf); doCapture(video, cleanup); };
  }

  function cleanup() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    disposeDetector();
  }
  onLeave(cleanup);

  // 1) Camera — prefer the REAR camera (someone photographs you at a proper
  //    distance); fall back to the front camera if there's no rear one.
  const dims = { width: { ideal: 720 }, height: { ideal: 960 } };
  let usingFront = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, ...dims },
      audio: false,
    });
  } catch (err) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", ...dims }, audio: false });
      usingFront = true;
    } catch (err2) {
      fb.textContent = "Camera unavailable";
      toast("Please allow camera access to try on");
      return;
    }
  }
  // Detect which camera we actually got (facingMode isn't guaranteed by "ideal").
  try {
    const fm = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
    if (fm === "user") usingFront = true;
    else if (fm === "environment") usingFront = false;
  } catch (e) {}
  // Mirror the preview ONLY for the front camera (a selfie feels natural mirrored;
  // a rear shot must not be flipped). Capture always uses the true, unmirrored frame.
  video.style.transform = usingFront ? "scaleX(-1)" : "none";
  video.srcObject = stream;
  await video.play().catch(() => {});

  // 2) Pose engine
  fb.textContent = "Loading pose guide…";
  try {
    await loadPoseDetector();
  } catch (err) {
    fb.textContent = "Pose guide unavailable — you can still capture";
    captureBtn.disabled = false;
    captureBtn.textContent = "Capture";
    captureBtn.addEventListener("click", () => doCapture(video, cleanup));
    return;
  }

  fb.textContent = "Step into the frame";

  // 3) Loop
  async function loop(ts) {
    if (!running) return;
    if (ts - lastRun > 140 && video.videoWidth) {
      lastRun = ts;
      let res;
      try {
        const kp = await estimate(video);
        res = analyze(kp, video.videoWidth, video.videoHeight, scope);
        // lighting check
        if (res.ok && isTooDark(video, sampler, sctx)) {
          res = { ok: false, message: "Find brighter light" };
        }
      } catch (e) {
        res = { ok: false, message: "Adjusting…" };
      }
      applyFeedback(res, ts);
    }
    raf = requestAnimationFrame(loop);
  }

  function applyFeedback(res, ts) {
    fb.textContent = res.message;
    fb.classList.toggle("good", res.ok);
    guide.classList.toggle("good", res.ok);

    if (res.ok) {
      if (!goodSince) goodSince = ts;
      const held = ts - goodSince;
      if (held >= 1000) {
        // auto-capture once held steady ~1s
        captureBtn.disabled = false;
        captureBtn.textContent = "Capturing…";
        running = false;
        if (raf) cancelAnimationFrame(raf);
        setTimeout(() => doCapture(video, cleanup), 120);
      } else {
        captureBtn.disabled = false;
        captureBtn.textContent = "Ready — hold still";
        captureBtn.onclick = () => doCapture(video, cleanup);
      }
    } else {
      goodSince = 0;
      if (performance.now() - startedAt > MANUAL_AFTER) {
        enableManual();
        fb.textContent = res.message + " · or tap Capture now";
      } else {
        captureBtn.disabled = true;
        captureBtn.textContent = "Hold your pose…";
      }
    }
  }

  raf = requestAnimationFrame(loop);
}

function doCapture(video, cleanup) {
  const w = video.videoWidth || 720, h = video.videoHeight || 960;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(video, 0, 0, w, h);
  capturedDataUrl = c.toDataURL("image/jpeg", 0.9);
  cleanup();
  go("tryonResult", {}, { title: "Your look" });
}

function isTooDark(video, canvas, ctx) {
  const w = 32, hh = 32;
  canvas.width = w; canvas.height = hh;
  ctx.drawImage(video, 0, 0, w, hh);
  const { data } = ctx.getImageData(0, 0, w, hh);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const avg = sum / (data.length / 4);
  return avg < 60; // 0..255
}

/* ── Result: AI compositing + protected display ──────── */
export async function renderResult(view) {
  const p = state.product;
  const personImage = capturedDataUrl;

  view.innerHTML = `
    <div class="loading" id="load">
      <div class="spinner"></div>
      <div>
        <div class="lb-title">Creating your look…</div>
        <div class="lb-sub">Styling ${escapeHtml(p ? p.name : "your outfit")} on you.<br>This usually takes up to a minute — hang tight.</div>
      </div>
    </div>
  `;

  if (!personImage) {
    view.innerHTML = `<div class="empty">No photo captured. Please try again.</div>`;
    return;
  }

  let resultSrc;
  try {
    const res = await api.tryOn({ product_id: p.id, image: personImage });
    resultSrc = res.image; // data URL or https URL
  } catch (err) {
    capturedDataUrl = null; // discard on failure too
    view.innerHTML = `
      <div class="empty">Couldn't create your look.<br><span class="muted">${escapeHtml(err.message)}</span></div>
      <div class="btn-row"><button class="btn btn-ghost" id="retry">Back</button></div>`;
    view.querySelector("#retry").addEventListener("click", () => backTo("product"));
    return;
  } finally {
    // Discard the captured photo from memory immediately after sending.
    capturedDataUrl = null;
  }

  view.innerHTML = `
    <div class="eyebrow">Your AI try-on</div>
    <div class="result-wrap" id="rw">
      <img id="resultImg" src="${escapeHtml(resultSrc)}" alt="Your look" draggable="false">
      <div class="wm"><span>RAMREE · AI PREVIEW</span></div>
    </div>
    <div class="secure-note">
      <svg viewBox="0 0 24 24" width="16" height="16" style="flex:0 0 auto;"><path d="M6 10V8a6 6 0 1112 0v2m-9 0h6a3 3 0 013 3v4a3 3 0 01-3 3H9a3 3 0 01-3-3v-4a3 3 0 013-3z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
      <span>This preview is protected with soft deterrents. Screenshots can't be fully blocked on the mobile web — a determined user can still capture it.</span>
    </div>

    <div class="section-title" style="margin-top:22px;">Do you like it?</div>
    <div class="like-row">
      <button class="btn btn-rose" id="yes">Yes, love it</button>
      <button class="btn btn-ghost" id="no">Not quite</button>
    </div>
  `;

  setupProtection(view);

  view.querySelector("#yes").addEventListener("click", () => go("postBuy", {}, { title: state.product.name }));
  // "No" → return to the product page where try-on was chosen
  view.querySelector("#no").addEventListener("click", () => backTo("product"));
}

/* Soft screenshot deterrents: blur on tab/app switch, block drag/context menu. */
function setupProtection(view) {
  const rw = view.querySelector("#rw");
  const onHide = () => { if (document.hidden) rw.classList.add("hide-secure"); else rw.classList.remove("hide-secure"); };
  const onBlur = () => rw.classList.add("hide-secure");
  const onFocus = () => rw.classList.remove("hide-secure");
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);
  rw.addEventListener("contextmenu", (e) => e.preventDefault());

  onLeave(() => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
  });
}
