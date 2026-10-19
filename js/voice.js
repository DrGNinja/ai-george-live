// The coach's voice: Kokoro TTS in the browser, using the instructor's blended or custom voice style.
// Falls back to the browser's built-in voices when Kokoro can't load.
// Audio plays through an AnalyserNode so the face can lip-sync to the real waveform.

import { LIBS, TTS_MODEL, KOKORO_VOICE_URL, KOKORO_SLOT } from "./config.js";
import { b64 } from "./util.js";

const STYLE_LEN = 510 * 256;
const voiceCache = new Map();

export async function fetchVoice(id) {
  if (voiceCache.has(id)) return voiceCache.get(id);
  const r = await fetch(KOKORO_VOICE_URL(id));
  if (!r.ok) throw new Error("Couldn't download voice " + id);
  const arr = new Float32Array(await r.arrayBuffer());
  voiceCache.set(id, arr); return arr;
}

/** Mix Kokoro voice styles, e.g. {am_michael: 0.6, bm_george: 0.4}. Returns a Float32Array style table. */
export async function blendVoices(blend) {
  const entries = Object.entries(blend || {}).filter(([, w]) => w > 0);
  if (!entries.length) return fetchVoice(KOKORO_SLOT);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  const out = new Float32Array(STYLE_LEN);
  for (const [id, w] of entries) { const v = await fetchVoice(id); for (let i = 0; i < STYLE_LEN; i++) out[i] += v[i] * (w / total); }
  return out;
}

export function styleFromBase64(str) {
  const bytes = b64.toBytes(str);
  const arr = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
  if (arr.length < STYLE_LEN) throw new Error("That voice file is the wrong size. Expected a Kokoro style table (510 × 256 floats).");
  return arr.slice(0, STYLE_LEN);
}

export class Voice {
  constructor() {
    this.ctx = null; this.analyser = null; this.tts = null; this.style = null; this.speed = 1;
    this.sources = new Set(); this.endAt = 0; this.gen = 0; this.mode = "none";
    this.onStart = null; this.onEnd = null; this.onBoundary = null;
  }

  ensureAudio() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = 0.5;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  async load(onProgress) {
    const tf = await import(LIBS.transformers);
    const { KokoroTTS } = await import(LIBS.kokoro);
    const webgpu = !!navigator.gpu;
    this.tts = await KokoroTTS.from_pretrained(TTS_MODEL, {
      dtype: webgpu ? "fp32" : "q8", device: webgpu ? "webgpu" : "wasm",
      progress_callback: p => { if (p.status === "progress") onProgress?.({ progress: (p.progress || 0) / 100, text: `Voice model: ${p.file}` }); }
    });
    // Use our own style table instead of a stock voice.
    const self = this, { Tensor, RawAudio } = tf;
    this.tts.generate_from_ids = async function (input_ids, { speed = 1 } = {}) {
      const style = self.style || await fetchVoice(KOKORO_SLOT);
      const l = 256 * Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
      const { waveform } = await this.model({ input_ids, style: new Tensor("float32", style.slice(l, l + 256), [1, 256]), speed: new Tensor("float32", [speed], [1]) });
      return new RawAudio(waveform.data, 24000);
    };
    this.mode = "kokoro";
  }

  async setVoice(cfg = {}) {
    this.speed = cfg.speed || 1;
    if (cfg.customStyle) this.style = styleFromBase64(cfg.customStyle);
    else this.style = await blendVoices(cfg.blend || { [KOKORO_SLOT]: 1 });
  }

  get speaking() { return this.sources.size > 0 || (this.mode === "browser" && speechSynthesis.speaking); }

  stop() {
    this.gen++;
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources.clear(); this.endAt = 0;
    if (this.mode === "browser") speechSynthesis.cancel();
    this.onEnd?.();
  }

  _play(float32, rate) {
    const ctx = this.ensureAudio();
    const buf = ctx.createBuffer(1, float32.length, rate); buf.copyToChannel(float32, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(this.analyser);
    const at = Math.max(ctx.currentTime + 0.05, this.endAt);
    if (!this.sources.size) this.onStart?.();
    src.start(at); this.endAt = at + buf.duration; this.sources.add(src);
    src.onended = () => { this.sources.delete(src); if (!this.sources.size) { this.endAt = 0; this.onEnd?.(); } };
  }

  /** Begin a spoken reply. Push text as the model writes it; sentences are voiced as soon as they finish. */
  begin() {
    const my = ++this.gen;
    if (this.mode !== "kokoro") return this._beginBrowser(my);
    const queue = [], self = this; let closed = false, wake = null, buffer = "";
    const next = () => new Promise(r => { wake = r; });
    const sentences = text => text.match(/[^.!?\n]+[.!?]+["')\]]*\s+|[^.!?\n]+\n+/g) || [];
    (async () => {
      while (my === self.gen) {
        if (!queue.length) { if (closed) break; await next(); continue; }
        const s = queue.shift().trim(); if (!s) continue;
        try { const audio = await self.tts.generate(s, { voice: KOKORO_SLOT, speed: self.speed }); if (my === self.gen) self._play(audio.audio, audio.sampling_rate); }
        catch (e) { console.warn("TTS failed for a sentence", e); }
      }
    })();
    return {
      push(text) { buffer += text; const done = sentences(buffer); if (done.length) { const used = done.join(""); buffer = buffer.slice(used.length); queue.push(...done); wake?.(); } },
      end() { if (buffer.trim()) queue.push(buffer); buffer = ""; closed = true; wake?.(); }
    };
  }

  _beginBrowser(my) {
    let buffer = "";
    const say = t => {
      const u = new SpeechSynthesisUtterance(t);
      const v = speechSynthesis.getVoices().find(v => /^en/i.test(v.lang) && /daniel|guy|david|aaron|alex|andrew|brian|christopher|eric|male/i.test(v.name)) || null;
      if (v) u.voice = v; u.rate = this.speed;
      u.onstart = () => { this.sources.add(u); if (this.sources.size === 1) this.onStart?.(); };
      u.onboundary = () => this.onBoundary?.();
      u.onend = u.onerror = () => { this.sources.delete(u); if (!this.sources.size && !speechSynthesis.pending) this.onEnd?.(); };
      if (my === this.gen) speechSynthesis.speak(u);
    };
    return { push(t) { buffer += t; const m = buffer.match(/^[\s\S]*[.!?]\s/); if (m) { say(m[0]); buffer = buffer.slice(m[0].length); } }, end() { if (buffer.trim()) say(buffer); buffer = ""; } };
  }

  useBrowserVoice() { this.mode = "browser"; }

  async say(text) { const s = this.begin(); s.push(text); s.end(); }
}
