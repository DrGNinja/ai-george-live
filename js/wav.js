// Convert a recorded clip to a clean mono WAV at a fixed sample rate (22,050 Hz for voice training).

export async function toWav(blob, rate = 22050) {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  ctx.close();
  const frames = Math.ceil(decoded.duration * rate);
  const off = new OfflineAudioContext(1, frames, rate);
  const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
  let pcm = (await off.startRendering()).getChannelData(0);
  pcm = trimSilence(pcm, rate);
  normalize(pcm);
  return { wav: encodeWav(pcm, rate), seconds: pcm.length / rate, peak: peakOf(pcm) };
}

function peakOf(a) { let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return p; }
function normalize(a) { const p = peakOf(a); if (p > 0.01) { const k = 0.9 / p; for (let i = 0; i < a.length; i++) a[i] *= k; } }

export function trimSilence(a, rate, thr = 0.02, pad = 0.15) {
  const win = Math.floor(rate * 0.01); let start = 0, end = a.length;
  const loud = i => { let s = 0; for (let j = i; j < Math.min(a.length, i + win); j++) s += a[j] * a[j]; return Math.sqrt(s / win) > thr; };
  for (let i = 0; i < a.length; i += win) if (loud(i)) { start = i; break; }
  for (let i = a.length - win; i > 0; i -= win) if (loud(i)) { end = i + win; break; }
  const p = Math.floor(pad * rate);
  return a.slice(Math.max(0, start - p), Math.min(a.length, end + p));
}

export function encodeWav(pcm, rate) {
  const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: "audio/wav" });
}
