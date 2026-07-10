/* Client-side pose checker for the try-on camera guide.
   Loads TensorFlow.js + MoveNet via UMD <script> tags (reliable on mobile —
   the previous ESM `+esm` build failed to register the WebGL backend). */

let detector = null;

const KP = { nose: 0, lShoulder: 5, rShoulder: 6, lHip: 11, rHip: 12, lAnkle: 15, rAnkle: 16 };
const MIN_SCORE = 0.35;
const V = "4.22.0";
const SCRIPTS = [
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@${V}/dist/tf-core.min.js`,
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter@${V}/dist/tf-converter.min.js`,
  `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@${V}/dist/tf-backend-webgl.min.js`,
  `https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js`,
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.async = false;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

export async function loadPoseDetector() {
  if (detector) return detector;
  // UMD scripts must load in order so globals (tf, poseDetection) register.
  for (const src of SCRIPTS) await loadScript(src);
  const tf = window.tf;
  const poseDetection = window.poseDetection;
  if (!tf || !poseDetection) throw new Error("Pose libraries unavailable");

  try { await tf.setBackend("webgl"); } catch (e) { /* fall back to default */ }
  await tf.ready();

  detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
  });
  return detector;
}

export async function estimate(video) {
  if (!detector) return null;
  const poses = await detector.estimatePoses(video, { flipHorizontal: false });
  return poses && poses[0] ? poses[0].keypoints : null;
}

/* scope: "upper" (t-shirts/tops — head + torso is enough) or "full" (kurti sets). */
export function analyze(keypoints, videoW, videoH, scope = "full") {
  if (!keypoints) return { ok: false, message: "Looking for you…" };
  const get = (i) => keypoints[i];
  const vis = (i) => get(i) && get(i).score >= MIN_SCORE;

  if (!vis(KP.nose) && !vis(KP.lShoulder) && !vis(KP.rShoulder)) return { ok: false, message: "Step into the frame" };
  if (!vis(KP.lShoulder) || !vis(KP.rShoulder)) return { ok: false, message: "Face the camera, shoulders in view" };

  const shoulderMid = mid(get(KP.lShoulder), get(KP.rShoulder));
  const shoulderW = Math.abs(get(KP.lShoulder).x - get(KP.rShoulder).x) / videoW;

  if (scope === "upper") {
    // Upper garments: only need head + shoulders/chest, centred and upright.
    const cx = shoulderMid.x / videoW;
    if (cx < 0.32) return { ok: false, message: "Move to your right" };
    if (cx > 0.68) return { ok: false, message: "Move to your left" };
    if (shoulderW > 0.62) return { ok: false, message: "Move back a little" };
    if (shoulderW < 0.20) return { ok: false, message: "Come a little closer" };
    // Leave headroom above the head so the top isn't cropped at the neckline.
    const headY = vis(KP.nose) ? get(KP.nose).y : shoulderMid.y;
    if (headY < videoH * 0.06) return { ok: false, message: "Lower the camera a touch" };
    return { ok: true, message: "Perfect — hold still" };
  }

  // Full-body scope (kurti sets etc.)
  if (!vis(KP.lHip) || !vis(KP.rHip)) return { ok: false, message: "Move back a little" };
  if (!vis(KP.lAnkle) && !vis(KP.rAnkle)) return { ok: false, message: "Move back so your feet are visible" };

  const hipMid = mid(get(KP.lHip), get(KP.rHip));

  const cx = hipMid.x / videoW;
  if (cx < 0.34) return { ok: false, message: "Move to your right" };
  if (cx > 0.66) return { ok: false, message: "Move to your left" };

  const dy = hipMid.y - shoulderMid.y;
  if (dy < videoH * 0.12) return { ok: false, message: "Stand tall, full body in frame" };
  const lean = Math.abs(shoulderMid.x - hipMid.x) / videoW;
  if (lean > 0.12) return { ok: false, message: "Stand straighter" };

  const headY = vis(KP.nose) ? get(KP.nose).y : shoulderMid.y;
  const footY = Math.max(vis(KP.lAnkle) ? get(KP.lAnkle).y : 0, vis(KP.rAnkle) ? get(KP.rAnkle).y : 0);
  const coverage = (footY - headY) / videoH;
  if (coverage < 0.55) return { ok: false, message: "Step back — fit your whole body in" };

  return { ok: true, message: "Perfect — hold still" };
}

export function disposeDetector() {
  try { if (detector) detector.dispose(); } catch (e) {}
  detector = null;
}

function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
