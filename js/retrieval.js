// BM25 search over course-pack passages. Runs locally, no model needed.

const STOP = new Set("a an the and or of to in on for is are was were be been it this that with as at by from what why how which who when does do did can could should would i you we they he she my your our their me about into than then there these those not no yes if but so any all".split(" "));
export const tokenize = s => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter(w => w.length > 1 && !STOP.has(w));

export function buildIndex(sources) {
  const docs = [];
  for (const src of sources || []) (src.chunks || []).forEach(text => {
    const words = tokenize(text), tf = new Map();
    words.forEach(w => tf.set(w, (tf.get(w) || 0) + 1));
    docs.push({ sid: src.id, title: src.title, week: src.week || 0, text, tf, len: words.length || 1 });
  });
  const df = new Map();
  docs.forEach(d => d.tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
  const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg, N: docs.length };
}

/** Top passages for a query, within a character budget (small local models have small context windows). */
export function retrieve(index, query, { week = 0, budget = 3200, max = 4 } = {}) {
  if (!index?.N) return [];
  const qs = [...new Set(tokenize(query))];
  const scored = [];
  for (const d of index.docs) {
    let s = 0;
    for (const w of qs) {
      const f = d.tf.get(w); if (!f) continue;
      const n = index.df.get(w);
      s += Math.log(1 + (index.N - n + 0.5) / (n + 0.5)) * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / index.avg));
    }
    if (s > 0) scored.push({ d, s: week && d.week === week ? s * 1.2 : s });
  }
  scored.sort((a, b) => b.s - a.s);
  const out = []; let used = 0;
  for (const { d, s } of scored) {
    if (s < 1.2 && out.length) break; // weak matches only pad the prompt
    const text = d.text.length > 1400 ? d.text.slice(0, 1400) + "…" : d.text;
    if (used + text.length > budget) continue;
    out.push({ ...d, text, score: s }); used += text.length;
    if (out.length >= max) break;
  }
  return out;
}
