// Small DOM, text and storage helpers shared by the live room and the Studio.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inline = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

/** Safe Markdown subset: paragraphs, lists, bold, italics, inline code, headings. */
export function md(src) {
  let html = "", list = null, para = [];
  const fp = () => { if (para.length) { html += "<p>" + inline(para.join(" ")) + "</p>"; para = []; } };
  const fl = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of String(src).replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd(); let m;
    if (!line.trim()) { fp(); fl(); continue; }
    if ((m = line.match(/^\s*#{1,4}\s+(.*)$/))) { fp(); fl(); html += `<p><strong>${inline(m[1])}</strong></p>`; continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { fp(); if (list !== "ul") { fl(); html += "<ul>"; list = "ul"; } html += "<li>" + inline(m[1]) + "</li>"; continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { fp(); if (list !== "ol") { fl(); html += "<ol>"; list = "ol"; } html += "<li>" + inline(m[1]) + "</li>"; continue; }
    fl(); para.push(line.trim());
  }
  fp(); fl(); return html;
}

/** Text suitable for speaking aloud: no markdown, no source tags. */
export const speakable = s => String(s)
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/\(([^)]*(deck|workbook|syllabus|week|source)[^)]*)\)/gi, "")
  .replace(/[*_`#>]/g, "")
  .replace(/\s+/g, " ").trim();

export const slug = s => String(s).toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export const store = {
  get(k, d) { try { const v = localStorage.getItem("agl_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("agl_" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("agl_" + k); } catch {} }
};

/** Minimal IndexedDB key-value store for large Studio work (frames, recordings). */
export const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("ai-george-studio", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction("kv", mode); const req = fn(t.objectStore("kv")); t.oncomplete = () => res(req instanceof IDBRequest ? req.result : undefined); t.onerror = () => rej(t.error); }); };
  return {
    get: k => tx("readonly", s => s.get(k)),
    set: (k, v) => tx("readwrite", s => { s.put(v, k); }),
    del: k => tx("readwrite", s => { s.delete(k); }),
    keys: () => tx("readonly", s => s.getAllKeys())
  };
})();

export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load " + src));
    document.head.append(s);
  });
}

export function download(name, blob) {
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export const b64 = {
  fromBytes(bytes) { let s = ""; const c = 0x8000; for (let i = 0; i < bytes.length; i += c) s += String.fromCharCode.apply(null, bytes.subarray(i, i + c)); return btoa(s); },
  toBytes(str) { const s = atob(str); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
};
