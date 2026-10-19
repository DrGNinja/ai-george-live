// Turn course files into plain text and passages (chunks) for a course pack.
// .docx via mammoth, .pptx via JSZip (slide text plus speaker notes), .pdf via pdf.js, .txt/.md as is.

import { LIBS, } from "./config.js";
import { loadScript } from "./util.js";

export function chunkText(text, size = 1200) {
  const paras = String(text).replace(/\r/g, "").split(/\n+/).map(s => s.trim()).filter(Boolean);
  const out = []; let cur = "";
  for (const p of paras) {
    if (p.length > size * 1.6) { if (cur) { out.push(cur.trim()); cur = ""; } for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size)); continue; }
    if (cur.length + p.length > size && cur) { out.push(cur.trim()); cur = ""; }
    cur += p + "\n";
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export async function extractText(file) {
  const name = file.name.toLowerCase();
  if (/\.(txt|md|csv)$/.test(name)) return await file.text();
  if (name.endsWith(".docx")) {
    await loadScript(LIBS.mammoth);
    const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  if (name.endsWith(".pptx")) {
    const JSZip = (await import(LIBS.jszip)).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const num = p => parseInt(p.match(/(\d+)\.xml$/)?.[1] || "0", 10);
    const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
    const text = xml => { const d = new DOMParser().parseFromString(xml, "application/xml"); return [...d.getElementsByTagName("a:p")].map(p => [...p.getElementsByTagName("a:t")].map(t => t.textContent).join("")).filter(Boolean).join("\n"); };
    const out = [];
    for (const p of slides) {
      const n = num(p); let t = `Slide ${n}\n` + text(await zip.file(p).async("string"));
      const notes = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
      if (notes) { const nt = text(await notes.async("string")).replace(/^\d+$/gm, "").trim(); if (nt) t += "\nNotes: " + nt; }
      out.push(t);
    }
    return out.join("\n\n");
  }
  if (name.endsWith(".pdf")) {
    const pdfjs = await import(LIBS.pdfjs);
    pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfjsWorker;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      let line = "", lines = [], lastY = null;
      for (const it of tc.items) { const y = it.transform?.[5]; if (lastY !== null && Math.abs(y - lastY) > 4) { lines.push(line); line = ""; } line += it.str; lastY = y; }
      lines.push(line); pages.push(lines.join("\n"));
    }
    return pages.join("\n\n");
  }
  throw new Error("Unsupported file type. Use .docx, .pptx, .pdf, .txt or .md.");
}

/** Pull clean, speakable sentences out of course text for the voice-recording script. */
export function scriptSentences(texts, max = 400) {
  const seen = new Set(), out = [];
  for (const t of texts) for (const s of String(t).replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)) {
    const c = s.trim();
    const words = c.split(" ").length;
    if (words < 6 || words > 22) continue;
    if (/https?:|@|\||_{2,}|\d{3,}|[A-Z]{5,}|^\W/.test(c)) continue;
    if (!/[.!?]$/.test(c)) continue;
    const k = c.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(c);
    if (out.length >= max) return out;
  }
  return out;
}
