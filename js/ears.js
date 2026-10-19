// Microphone capture with simple voice-activity detection, and Whisper speech-to-text in the browser.
// Audio never leaves the device.

import { LIBS, STT_MODEL } from "./config.js";

const WORKLET = `class Tap extends AudioWorkletProcessor { process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; } } registerProcessor("tap", Tap);`;

export class Mic {
  constructor({ onUtterance, onLevel, onSpeechStart, onBargeIn } = {}) {
    Object.assign(this, { onUtterance, onLevel, onSpeechStart, onBargeIn });
    this.rate = 16000; this.gated = false; this.listening = false; this.stream = null; this.ctx = null;
    this.floor = 0.006; this.pre = []; this.cur = null; this.loud = 0; this.quiet = 0; this.bargeLoud = 0;
  }
  async start() {
    if (this.ctx) { this.listening = true; return; }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    this.ctx = new AudioContext({ sampleRate: this.rate });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    const tap = new AudioWorkletNode(this.ctx, "tap");
    let buf = [], n = 0; const win = this.rate * 0.02; // 20 ms windows
    tap.port.onmessage = e => { buf.push(e.data); n += e.data.length; if (n >= win) { const f = concat(buf); buf = []; n = 0; this._frame(f); } };
    src.connect(tap); // not connected to the speakers
    this.listening = true;
  }
  stop() { this.listening = false; this.cur = null; }
  close() { this.stop(); this.stream?.getTracks().forEach(t => t.stop()); this.ctx?.close(); this.ctx = null; this.stream = null; }
  _frame(f) {
    let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i];
    const rms = Math.sqrt(s / f.length);
    this.onLevel?.(rms);
    if (!this.cur && rms < this.floor * 2) this.floor = this.floor * 0.995 + rms * 0.005; // adapt to room noise
    const on = rms > Math.max(this.floor * 3.2, 0.012);
    if (this.gated) { // coach is talking: only listen for a clear interruption
      this.bargeLoud = rms > Math.max(this.floor * 7, 0.05) ? this.bargeLoud + 1 : 0;
      if (this.bargeLoud > 12) { this.bargeLoud = 0; this.onBargeIn?.(); }
      return;
    }
    if (!this.listening) return;
    if (!this.cur) {
      this.pre.push(f); if (this.pre.length > 20) this.pre.shift(); // 400 ms pre-roll
      this.loud = on ? this.loud + 1 : 0;
      if (this.loud >= 3) { this.cur = [...this.pre]; this.pre = []; this.quiet = 0; this.onSpeechStart?.(); }
      return;
    }
    this.cur.push(f);
    this.quiet = on ? 0 : this.quiet + 1;
    const dur = this.cur.length * 0.02;
    if (this.quiet > 40 || dur > 25) { // 800 ms of silence, or 25 s max
      const audio = concat(this.cur); this.cur = null; this.loud = 0;
      if (dur > 0.6) this.onUtterance?.(audio);
    }
  }
}

function concat(parts) { const n = parts.reduce((a, p) => a + p.length, 0); const out = new Float32Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }

export class Whisper {
  constructor() { this.asr = null; }
  async load(onProgress) {
    if (this.asr) return;
    const { pipeline } = await import(LIBS.transformers);
    const webgpu = !!navigator.gpu;
    this.asr = await pipeline("automatic-speech-recognition", STT_MODEL, {
      device: webgpu ? "webgpu" : "wasm",
      dtype: webgpu ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
      progress_callback: p => { if (p.status === "progress") onProgress?.({ progress: (p.progress || 0) / 100, text: `Speech model: ${p.file}` }); }
    });
  }
  async transcribe(float32at16k) {
    if (!this.asr) throw new Error("Speech recognition isn't loaded.");
    const out = await this.asr(float32at16k, { chunk_length_s: 30 });
    const text = String(out?.text || "").trim();
    // Whisper sometimes hallucinates on silence or noise.
    if (/^\[.*\]$|^\(.*\)$|^(thank you\.?|thanks for watching\.?|you)$/i.test(text)) return "";
    return text;
  }
}
