// The student's camera: a mirrored self-view plus on-device face detection, so the coach knows
// when someone is there. Video frames are never stored, uploaded or sent to any model.

import { LIBS } from "./config.js";

export class Presence {
  constructor(video, { onChange } = {}) {
    this.video = video; this.onChange = onChange; this.stream = null; this.detector = null;
    this.present = false; this.lastSeen = 0; this.timer = null;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
    this.video.srcObject = this.stream; await this.video.play().catch(() => {});
    try {
      const { FilesetResolver, FaceDetector } = await import(LIBS.mediapipe);
      const fs = await FilesetResolver.forVisionTasks(LIBS.mediapipeWasm);
      this.detector = await FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: LIBS.faceDetectorModel, delegate: "GPU" }, runningMode: "VIDEO", minDetectionConfidence: 0.6 });
    } catch (e) { console.warn("Face detection unavailable; presence is assumed.", e); this._set(true); }
    this.timer = setInterval(() => this._tick(), 400);
  }
  _tick() {
    if (!this.detector || this.video.readyState < 2) return;
    try {
      const r = this.detector.detectForVideo(this.video, performance.now());
      const seen = (r?.detections || []).length > 0;
      if (seen) this.lastSeen = performance.now();
      this._set(seen || performance.now() - this.lastSeen < 4000);
    } catch {}
  }
  _set(v) { if (v !== this.present) { this.present = v; this.onChange?.(v); } }
  stop() { clearInterval(this.timer); this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.video.srcObject = null; this._set(false); }
}
