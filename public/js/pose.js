/* Client-side pose checker for the try-on camera guide.
   Uses TensorFlow.js MoveNet (SinglePose Lightning) — runs fully in-browser,
   free, no API cost. Lazy-loaded from CDN only when the try-on screen opens. */

let detector = null;
let tf = null;

// MoveNet keypoint indices
const KP = { nose: 0, lShoulder: 5, rShoulder: 6, lHip: 11, rHip: 12, lAnkle: 15, rAnkle: 16 };
const MIN_SCORE = 0.35;

export async function loadPoseDetector() {
  if (detector) return detector;
  tf = await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/+esm");
  const poseDetection = await import("https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/+esm");
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

/* Analyze keypoints → { ok, message }.
   videoW/H are the intrinsic video dimensions. */
export function analyze(keypoints, videoW, videoH) {
  if (!keypoints) return { ok: false, message: "Looking for you…" };

  const get = (i) => keypoints[i];
  const vis = (i) => get(i) && get(i).score >= MIN_SCORE;

  // Head in frame?
  if (!vis(KP.nose) && !vis(KP.lShoulder) && !vis(KP.rShoulder)) {
    return { ok: false, message: "Step into the frame" };
  }
  // Shoulders?
  if (!vis(KP.lShoulder) || !vis(KP.rShoulder)) {
    return { ok: false, message: "Face the camera, shoulders in view" };
  }
  // Hips?
  if (!vis(KP.lHip) || !vis(KP.rHip)) {
    return { ok: false, message: "Move back a little" };
  }
  // Ankles / feet — the key "full body" check
  if (!vis(KP.lAnkle) && !vis(KP.rAnkle)) {
    return { ok: false, message: "Move back so your feet are visible" };
  }

  const shoulderMid = mid(get(KP.lShoulder), get(KP.rShoulder));
  const hipMid = mid(get(KP.lHip), get(KP.rHip));

  // Centered horizontally?
  const cx = hipMid.x / videoW; // note: video is mirrored in CSS only; coords are raw
  if (cx < 0.34) return { ok: false, message: "Move to your right" };
  if (cx > 0.66) return { ok: false, message: "Move to your left" };

  // Upright? shoulders should sit clearly above hips, and spine roughly vertical.
  const dy = hipMid.y - shoulderMid.y;
  if (dy < videoH * 0.12) return { ok: false, message: "Stand tall, full body in frame" };
  const lean = Math.abs(shoulderMid.x - hipMid.x) / videoW;
  if (lean > 0.12) return { ok: false, message: "Stand straighter" };

  // Full height usage — head near top, feet near bottom
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
