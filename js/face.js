// The talking face. Built from real, aligned camera frames of the instructor captured in the Studio:
// a neutral base, mouth shapes (mid, open, wide "ee", round "oo") and a blink.
// Only the mouth and eye regions are blended over the neutral frame, so the head stays steady.
// Mouth shapes follow the actual voice audio (loudness and brightness), blinks and small head
// movements are added for life. A single photo also works, using a simpler jaw animation.

const VISEMES = ["mid", "open", "wide", "round"];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("image failed")); i.src = src; }); }

function maskedLayer(img, size, reg, feather = 0.62) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, size, size);
  g.globalCompositeOperation = "destination-in";
  const cx = reg.cx * size, cy = reg.cy * size, rx = reg.rx * size, ry = reg.ry * size;
  g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(feather, "rgba(0,0,0,1)"); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
  return c;
}

export class FaceRig {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.ready = false; this.kind = null; this.analyser = null; this.speaking = false; this.boundaryAt = 0;
    this.w = { mid: 0, open: 0, wide: 0, round: 0 }; this.blink = 0; this.nextBlink = performance.now() + 2500; this.blinkT = -1;
    this.t0 = performance.now(); this.freq = null; this.time = null; this.level = 0;
    this.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
  }

  /** bundle.face = {size, frames:{neutral,mid,open,wide,round,blink}, regions:{mouth,eyes}} or {photo, mouth:{x,y,w,chin}} */
  async load(face) {
    this.ready = false;
    if (face?.frames?.neutral) {
      const size = face.size || 512; this.size = size; this.canvas.width = this.canvas.height = size;
      const imgs = {};
      for (const [k, v] of Object.entries(face.frames)) if (v) imgs[k] = await loadImg(v);
      this.base = imgs.neutral;
      this.layers = {};
      for (const v of VISEMES) { const src = imgs[v] || imgs.open || imgs.mid; if (src) this.layers[v] = maskedLayer(src, size, face.regions.mouth); }
      if (imgs.blink) this.blinkLayer = maskedLayer(imgs.blink, size, face.regions.eyes, 0.55);
      this.kind = "frames";
    } else if (face?.photo) {
      this.photo = await loadImg(face.photo); this.mouth = face.mouth || { x: .5, y: .62, w: .08, chin: .75 };
      this.size = 512; this.canvas.width = this.canvas.height = 512; this.kind = "photo";
      this.jaw = document.createElement("canvas");
    } else { this.kind = null; return false; }
    this.ready = true; return true;
  }

  attach(analyser) { this.analyser = analyser; if (analyser) { this.freq = new Uint8Array(analyser.frequencyBinCount); this.time = new Uint8Array(analyser.fftSize); } }
  boundary() { this.boundaryAt = performance.now(); }

  _signal(now) {
    if (this.analyser && this.speaking) {
      this.analyser.getByteTimeDomainData(this.time);
      let s = 0; for (const v of this.time) { const x = (v - 128) / 128; s += x * x; }
      const rms = Math.sqrt(s / this.time.length);
      this.analyser.getByteFrequencyData(this.freq);
      const hz = this.analyser.context.sampleRate / 2 / this.freq.length;
      let num = 0, den = 0;
      for (let i = Math.floor(250 / hz); i < Math.min(this.freq.length, Math.floor(5000 / hz)); i++) { num += this.freq[i] * i * hz; den += this.freq[i]; }
      return { open: clamp((rms - 0.015) / 0.13), centroid: den ? num / den : 1500 };
    }
    if (this.speaking) { // browser voice: no waveform, so animate from word boundaries
      const t = (now - this.t0) / 1000, since = now - this.boundaryAt;
      const pulse = since < 260 ? 1 - since / 260 : 0;
      return { open: clamp(0.25 + 0.45 * pulse + 0.2 * Math.abs(Math.sin(t * 8.7) * Math.sin(t * 2.3))), centroid: 1200 + 900 * Math.sin(t * 3.7) };
    }
    return { open: 0, centroid: 1500 };
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    if (!this.ready) return;
    const { open, centroid } = this._signal(now);
    this.level = open;
    const tgt = { mid: 0, open: 0, wide: 0, round: 0 };
    if (open > 0.06) {
      const wide = open * clamp((centroid - 1700) / 1300), round = open * clamp((1150 - centroid) / 650);
      const rest = Math.max(0, open - wide - round);
      Object.assign(tgt, { wide, round, mid: rest * (1 - open), open: rest * open * 1.2 });
    }
    for (const k of VISEMES) { const a = tgt[k] > this.w[k] ? 0.55 : 0.28; this.w[k] += (tgt[k] - this.w[k]) * a; }
    // blinks
    if (this.blinkT < 0 && now > this.nextBlink) this.blinkT = now;
    if (this.blinkT >= 0) { const p = (now - this.blinkT) / 170; this.blink = p < 1 ? Math.sin(p * Math.PI) : 0; if (p >= 1) { this.blinkT = -1; this.nextBlink = now + 2200 + Math.random() * 4200; } }
    this._draw(now);
  }

  _draw(now) {
    const g = this.ctx, S = this.size, t = (now - this.t0) / 1000;
    g.save(); g.clearRect(0, 0, S, S);
    if (!this.reduce) {
      const dx = Math.sin(t * 0.7) * S * 0.004, dy = Math.sin(t * 0.9 + 1) * S * 0.003 + this.level * S * 0.004;
      const rot = Math.sin(t * 0.5) * 0.006;
      g.translate(S / 2 + dx, S / 2 + dy); g.rotate(rot); g.scale(1.015, 1.015); g.translate(-S / 2, -S / 2);
    }
    if (this.kind === "frames") {
      g.drawImage(this.base, 0, 0, S, S);
      for (const v of VISEMES) { const w = this.w[v]; if (w > 0.02 && this.layers[v]) { g.globalAlpha = clamp(w * 1.3); g.drawImage(this.layers[v], 0, 0); } }
      if (this.blink > 0.02 && this.blinkLayer) { g.globalAlpha = this.blink; g.drawImage(this.blinkLayer, 0, 0); }
      g.globalAlpha = 1;
    } else if (this.kind === "photo") this._drawPhoto(g, S);
    g.restore();
  }

  _drawPhoto(g, S) { // single-photo fallback: shift the lower jaw down and show a dark mouth gap
    const img = this.photo, m = this.mouth;
    const s = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
    g.drawImage(img, sx, sy, s, s, 0, 0, S, S);
    const open = this.w.open + this.w.mid * 0.6 + this.w.wide * 0.5 + this.w.round * 0.5;
    if (open < 0.03) return;
    const mx = m.x * S, my = m.y * S, mw = m.w * S, cy = m.chin * S, drop = open * (cy - my) * 0.16;
    const jw = Math.ceil(mw * 3.2), jh = Math.ceil((cy - my) * 1.35), J = this.jaw; J.width = jw; J.height = jh;
    const jc = J.getContext("2d"); jc.drawImage(this.canvas, mx - jw / 2, my, jw, jh, 0, 0, jw, jh);
    jc.globalCompositeOperation = "destination-in";
    const gr = jc.createRadialGradient(jw / 2, jh * .32, 0, jw / 2, jh * .32, jw * .5); gr.addColorStop(0, "#000"); gr.addColorStop(.7, "#000"); gr.addColorStop(1, "rgba(0,0,0,0)");
    jc.fillStyle = gr; jc.fillRect(0, 0, jw, jh);
    g.fillStyle = "rgba(38,14,14,.92)"; g.beginPath(); g.ellipse(mx, my + drop * .5, mw * .72, Math.max(1, drop * .6), 0, 0, Math.PI * 2); g.fill();
    g.drawImage(J, mx - jw / 2, my + drop);
  }
}
