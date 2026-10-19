// Studio face capture. Uses MediaPipe Face Landmarker (on-device) to:
//  1. align every camera frame on the eyes, so all frames line up pixel for pixel;
//  2. read mouth and blink "blendshapes" to pick the best frame for each mouth shape;
//  3. locate the mouth and eye regions the live renderer blends.

import { LIBS } from "./config.js";

export const SIZE = 512;
const EYE_Y = 0.40, EYE_L = 0.395, EYE_R = 0.605;

export const STEPS = [
  { key: "neutral", say: "Look at the camera. Relax, lips together.", secs: 3 },
  { key: "open", say: "Say “aaah” and hold it.", secs: 2.5 },
  { key: "wide", say: "Say “eeee”, like a big smile.", secs: 2.5 },
  { key: "round", say: "Say “oooo”, lips rounded.", secs: 2.5 },
  { key: "mid", say: "Softly repeat “eh, eh, eh”.", secs: 2.5 },
  { key: "blink", say: "Slowly close your eyes twice.", secs: 3 }
];

let landmarker = null;
export async function loadLandmarker() {
  if (landmarker) return landmarker;
  const { FaceLandmarker, FilesetResolver } = await import(LIBS.mediapipe);
  const fs = await FilesetResolver.forVisionTasks(LIBS.mediapipeWasm);
  landmarker = await FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: LIBS.faceLandmarkerModel, delegate: "GPU" }, outputFaceBlendshapes: true, runningMode: "VIDEO", numFaces: 1 });
  return landmarker;
}

const avg = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export function blend(cats) { const o = {}; for (const c of cats || []) o[c.categoryName] = c.score; return o; }

/** Draw `source` into a SIZE×SIZE canvas aligned on the eyes. Returns {canvas, points} with points in 0..1 aligned space. */
export function align(source, lms, sw, sh) {
  const P = i => ({ x: lms[i].x * sw, y: lms[i].y * sh });
  const L = avg(P(33), P(133)), R = avg(P(362), P(263));
  const dSrc = Math.hypot(R.x - L.x, R.y - L.y), dDst = (EYE_R - EYE_L) * SIZE;
  const k = dDst / dSrc, th = Math.atan2(R.y - L.y, R.x - L.x);
  const c = document.createElement("canvas"); c.width = c.height = SIZE;
  const g = c.getContext("2d");
  g.fillStyle = "#0b1424"; g.fillRect(0, 0, SIZE, SIZE);
  g.translate(EYE_L * SIZE, EYE_Y * SIZE); g.rotate(-th); g.scale(k, k); g.translate(-L.x, -L.y);
  g.drawImage(source, 0, 0, sw, sh);
  const cos = Math.cos(-th), sin = Math.sin(-th);
  const map = p => { const x = (p.x - L.x) * k, y = (p.y - L.y) * k; return { x: (x * cos - y * sin + EYE_L * SIZE) / SIZE, y: (x * sin + y * cos + EYE_Y * SIZE) / SIZE }; };
  const points = {}; for (const i of [0, 13, 14, 17, 61, 291, 152, 33, 133, 362, 263, 159, 386]) points[i] = map(P(i));
  return { canvas: c, points };
}

export function regionsFrom(points) {
  const mx = (points[61].x + points[291].x) / 2, mw = points[291].x - points[61].x;
  const top = points[0].y, chin = points[152].y;
  const eyeY = (points[159].y + points[386].y) / 2, eyeW = points[263].x - points[33].x;
  return {
    mouth: { cx: mx, cy: (top + chin) / 2 + (chin - top) * 0.05, rx: Math.max(0.06, mw * 1.0), ry: Math.max(0.06, (chin - top) * 0.72) },
    eyes: { cx: (points[33].x + points[263].x) / 2, cy: eyeY, rx: eyeW * 0.78, ry: eyeW * 0.26 }
  };
}

const SCORE = {
  neutral: b => -((b.jawOpen || 0) * 2 + (b.eyeBlinkLeft || 0) + (b.eyeBlinkRight || 0) + (b.mouthPucker || 0) + (b.mouthFunnel || 0) + 0.5 * ((b.mouthSmileLeft || 0) + (b.mouthSmileRight || 0))),
  open: b => (b.jawOpen || 0) - 0.6 * (b.mouthPucker || 0) - 0.5 * ((b.eyeBlinkLeft || 0) + (b.eyeBlinkRight || 0)),
  wide: b => ((b.mouthStretchLeft || 0) + (b.mouthStretchRight || 0)) / 2 + 0.7 * ((b.mouthSmileLeft || 0) + (b.mouthSmileRight || 0)) / 2 - (b.mouthPucker || 0) - 0.4 * ((b.eyeBlinkLeft || 0) + (b.eyeBlinkRight || 0)),
  round: b => (b.mouthPucker || 0) + (b.mouthFunnel || 0) - 0.5 * ((b.mouthStretchLeft || 0) + (b.mouthStretchRight || 0)) - 0.4 * ((b.eyeBlinkLeft || 0) + (b.eyeBlinkRight || 0)),
  mid: b => -Math.abs((b.jawOpen || 0) - 0.28) - 0.5 * (b.mouthPucker || 0) - 0.5 * ((b.eyeBlinkLeft || 0) + (b.eyeBlinkRight || 0)),
  blink: b => ((b.eyeBlinkLeft || 0) + (b.eyeBlinkRight || 0)) / 2 - (b.jawOpen || 0)
};

/** Rank captured candidates for a slot; returns the top n. */
export function rank(slot, cands, n = 3) { return cands.map(c => ({ c, s: SCORE[slot](c.b) })).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.c); }

/** Align a single still photo (selfie or upload). Returns {canvas, points} or null when no face is found. */
export async function alignStill(img) {
  const lm = await loadLandmarker();
  await lm.setOptions({ runningMode: "IMAGE" });
  const r = lm.detect(img);
  await lm.setOptions({ runningMode: "VIDEO" });
  const l = r?.faceLandmarks?.[0]; if (!l) return null;
  return align(img, l, img.naturalWidth || img.videoWidth || img.width, img.naturalHeight || img.videoHeight || img.height);
}
