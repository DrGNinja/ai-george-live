// Instructor Studio: capture the face, set up the voice, build course packs and publish encrypted bundles.

import { $, $$, el, idb, store, slug, download, b64, sleep } from "./util.js";
import { LIBS, KOKORO_MALE_VOICES, PATHS } from "./config.js";
import { sealJSON } from "./vault.js";
import { chunkText, extractText, scriptSentences } from "./importers.js";
import { toWav } from "./wav.js";
import { FaceRig } from "./face.js";
import { Voice } from "./voice.js";
import { STEPS, SIZE, loadLandmarker, align, blend, rank, regionsFrom, alignStill } from "./facecap.js";

const status = (node, text, kind) => { node.textContent = text; node.className = "log-line" + (kind ? " " + kind : ""); };
const field = (label, id, value = "", opts = {}) => { const i = opts.area ? el("textarea", { id, rows: opts.rows || 4 }) : el("input", { id, type: opts.type || "text", placeholder: opts.ph || "" }); i.value = value ?? ""; return el("label", { class: "f" + (opts.full ? " full" : "") }, label, i); };

/* ---------- tabs ---------- */
const TABS = ["profile", "face", "voice", "packs", "publish"];
function showTab(id) {
  $$(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === id ? "true" : "false"));
  TABS.forEach(t => $("#panel-" + t).hidden = t !== id);
  store.set("studioTab", id);
  ({ profile: renderProfile, face: renderFace, voice: renderVoice, packs: renderPacks, publish: renderPublish })[id]();
}
$("#tabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) showTab(b.dataset.tab); });

/* ---------- 1 · profile ---------- */
const DEFAULT_PROFILE = { name: "Dr. George Antoniou", title: "Full Professor of Cybersecurity", school: "Lynn University · College of Business and Management", email: "gantoniou@lynn.edu", tutorName: "AI George" };
async function getProfile() { return { ...DEFAULT_PROFILE, ...((await idb.get("profile")) || {}) }; }
async function renderProfile() {
  const p = await getProfile(), box = $("#panel-profile"); box.innerHTML = "";
  const msg = el("div", { class: "log-line" });
  box.append(el("h2", {}, "Your profile"), el("p", { class: "muted" }, "Shown to students in every course. The coach introduces itself as an AI coach for you."),
    el("div", { class: "two" }, el("div", { class: "stack" }, field("Your name", "pName", p.name), field("Title", "pTitle", p.title), field("Email for students", "pEmail", p.email, { type: "email" })),
      el("div", { class: "stack" }, field("School line", "pSchool", p.school), field("Coach name", "pTutor", p.tutorName))),
    el("div", { class: "row" }, el("button", { class: "btn primary", type: "button", onclick: async () => { await idb.set("profile", { name: $("#pName").value.trim(), title: $("#pTitle").value.trim(), email: $("#pEmail").value.trim(), school: $("#pSchool").value.trim(), tutorName: $("#pTutor").value.trim() || "AI George" }); status(msg, "Saved.", "ok"); } }, "Save profile")), msg);
}

/* ---------- 2 · face ---------- */
let camStream = null, cands = {}, picks = {}, previewRig = null, previewVoice = null;
async function renderFace() {
  const box = $("#panel-face"); box.innerHTML = "";
  const video = el("video", { playsinline: true, muted: true });
  const prompt = el("div", { class: "prompt" }, "Turn on your camera to begin");
  const count = el("div", { class: "count", hidden: true });
  const cam = el("div", { class: "cam" }, video, prompt, count);
  const msg = el("div", { class: "log-line" });
  const prevCanvas = el("canvas", { width: SIZE, height: SIZE, style: { width: "100%", aspectRatio: "1", borderRadius: "12px", background: "#0b1424" } });
  const slotsBox = el("div", { class: "stack" });
  const regionScale = el("input", { type: "range", min: "0.8", max: "1.5", step: "0.05", value: String(store.get("mouthScale", 1)), id: "mouthScale", "aria-label": "Mouth area size" });

  const startCam = el("button", { class: "btn", type: "button", onclick: async () => {
    try { camStream = camStream || await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: "user" }, audio: false }); video.srcObject = camStream; await video.play(); prompt.textContent = "Good light on your face, camera at eye level, plain background."; status(msg, "Loading face tracking…"); await loadLandmarker(); status(msg, "Ready. Press Record face.", "ok"); }
    catch (e) { status(msg, "Camera or face tracking couldn't start: " + (e.message || e), "err"); }
  } }, "Turn on camera");

  const recBtn = el("button", { class: "btn primary", type: "button", onclick: async () => {
    if (!camStream) return status(msg, "Turn on the camera first.", "err");
    const lm = await loadLandmarker(); recBtn.disabled = true; cands = {};
    for (const step of STEPS) {
      cands[step.key] = [];
      prompt.textContent = step.say; count.hidden = false;
      for (let c = 3; c > 0; c--) { count.textContent = "Get ready " + c; await sleep(450); }
      const until = performance.now() + step.secs * 1000;
      while (performance.now() < until) {
        count.textContent = "Recording " + Math.ceil((until - performance.now()) / 1000) + "s";
        const r = lm.detectForVideo(video, performance.now());
        const l = r?.faceLandmarks?.[0];
        if (l) { const a = align(video, l, video.videoWidth, video.videoHeight); cands[step.key].push({ ...a, b: blend(r.faceBlendshapes?.[0]?.categories) }); }
        await sleep(90);
      }
    }
    count.hidden = true; prompt.textContent = "Done. Check the frames on the right.";
    picks = {}; for (const s of STEPS) picks[s.key] = rank(s.key, cands[s.key], 3);
    const missing = STEPS.filter(s => !picks[s.key].length).map(s => s.key);
    status(msg, missing.length ? "No face found during: " + missing.join(", ") + ". Re-record with your face centered." : "Captured. Pick alternatives if a frame looks off, then Save face.", missing.length ? "err" : "ok");
    recBtn.disabled = false; drawSlots(); await buildPreview();
  } }, "Record face (about 20 s)");

  const selfieBtn = el("button", { class: "btn", type: "button", onclick: async () => {
    if (!camStream) return status(msg, "Turn on the camera first.", "err");
    const a = await alignStill(video); if (!a) return status(msg, "No face found. Look at the camera.", "err");
    await savePhotoFace(a); status(msg, "Selfie saved as a single-photo face. Recording the full face gives a much better result.", "ok"); await buildPreview(await idb.get("face"));
  } }, "Take a selfie instead");
  const upload = el("input", { type: "file", accept: "image/*", id: "faceUpload" });
  upload.addEventListener("change", async () => {
    const f = upload.files[0]; if (!f) return;
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
    try { const a = await alignStill(img); if (!a) return status(msg, "No face found in that photo.", "err"); await savePhotoFace(a); status(msg, "Photo saved as a single-photo face.", "ok"); await buildPreview(await idb.get("face")); }
    catch (e) { status(msg, "Face tracking couldn't load: " + (e.message || e), "err"); }
  });

  function drawSlots() {
    slotsBox.innerHTML = "";
    if (!Object.keys(picks).length) { slotsBox.append(el("p", { class: "muted" }, "Frames appear here after recording.")); return; }
    slotsBox.append(el("div", { class: "frames" }, STEPS.map(s => {
      const best = picks[s.key]?.[0];
      return el("div", { class: "frame" }, best ? el("img", { src: best.canvas.toDataURL("image/jpeg", .8), alt: s.key }) : el("div", { class: "muted" }, "missing"), el("strong", {}, s.key),
        el("div", { class: "row", style: { gap: "4px" } }, (picks[s.key] || []).slice(1).map((alt, i) => el("span", { class: "frame alt", style: { width: "44px" } }, el("img", { src: alt.canvas.toDataURL("image/jpeg", .6), alt: "alternative", title: "Use this one", onclick: async () => { const arr = picks[s.key]; [arr[0], arr[i + 1]] = [arr[i + 1], arr[0]]; drawSlots(); await buildPreview(); } })))));
    })));
  }
  async function currentFace() {
    if (!picks.neutral?.length) return null;
    const regions = regionsFrom(picks.neutral[0].points), k = +regionScale.value;
    regions.mouth.rx *= k; regions.mouth.ry *= k; regions.mouth.cy += (k - 1) * regions.mouth.ry * 0.25;
    const frames = {}; for (const s of STEPS) if (picks[s.key]?.[0]) frames[s.key] = picks[s.key][0].canvas.toDataURL("image/webp", 0.86);
    return { size: SIZE, frames, regions };
  }
  async function buildPreview(face) {
    face = face || await currentFace() || await idb.get("face");
    previewRig = previewRig || new FaceRig(prevCanvas);
    if (previewRig.canvas !== prevCanvas) { previewRig = new FaceRig(prevCanvas); }
    if (face) await previewRig.load(face);
  }
  regionScale.addEventListener("input", async () => { store.set("mouthScale", +regionScale.value); await buildPreview(); });
  const testBtn = el("button", { class: "btn", type: "button", onclick: async () => {
    if (!previewRig?.ready) return status(msg, "Record or load a face first.", "err");
    const line = "Hello Fighting Knights. I'm your AI coach. Ask me about risk assessment, controls, or anything from this week.";
    if (previewVoice?.mode === "kokoro") { previewRig.attach(previewVoice.analyser); previewVoice.onStart = () => previewRig.speaking = true; previewVoice.onEnd = () => previewRig.speaking = false; previewVoice.say(line); }
    else { const u = new SpeechSynthesisUtterance(line); previewRig.attach(null); u.onstart = () => previewRig.speaking = true; u.onboundary = () => previewRig.boundary(); u.onend = () => previewRig.speaking = false; speechSynthesis.speak(u); }
  } }, "Test talking");
  const saveBtn = el("button", { class: "btn primary", type: "button", onclick: async () => { const f = await currentFace(); if (!f) return status(msg, "Record your face first.", "err"); await idb.set("face", f); status(msg, `Saved face (${Math.round(JSON.stringify(f).length / 1024)} KB).`, "ok"); } }, "Save face");

  box.append(el("h2", {}, "Your face"),
    el("p", { class: "muted" }, "The camera records about 20 seconds while you follow six prompts. Face tracking runs on this computer, lines up every frame on your eyes and picks the best frame for each mouth shape. Students see these real frames blended as you speak."),
    el("div", { class: "two" },
      el("div", { class: "stack" }, cam, el("div", { class: "row" }, startCam, recBtn, selfieBtn), el("label", { class: "f" }, "Or upload a front-facing photo", upload), msg),
      el("div", { class: "stack" }, el("span", { class: "eyebrow" }, "Preview"), prevCanvas, el("label", { class: "f" }, "Mouth area size (raise it if you see a seam at the chin)", regionScale), el("div", { class: "row" }, testBtn, saveBtn), slotsBox)));
  drawSlots(); buildPreview(await idb.get("face"));
}
async function savePhotoFace(a) {
  const p = a.points, mw = (p[291].x - p[61].x) / 2;
  await idb.set("face", { photo: a.canvas.toDataURL("image/webp", 0.88), mouth: { x: (p[61].x + p[291].x) / 2, y: (p[13].y + p[14].y) / 2, w: mw, chin: p[152].y } });
}

/* ---------- 3 · voice ---------- */
const SAMPLE = "Risk is not the same as a vulnerability. A vulnerability is a weakness; risk also depends on the threat, the likelihood and the business impact.";
const INTRO_LINES = [
  "Hello, I am George Antoniou, and this is my voice for the course coach.",
  "The quick brown fox jumps over the lazy dog while the band plays jazz.",
  "Please call Stella and ask her to bring these things with her from the store.",
  "Defense in depth means that no single safeguard stands alone.",
  "We will measure likelihood, impact, and the evidence behind every claim."
];
let recorder = null, recIdx = 0;
async function renderVoice() {
  const box = $("#panel-voice"); box.innerHTML = "";
  const cfg = { blend: { am_michael: 0.6, bm_george: 0.4 }, speed: 1, ...((await idb.get("voice")) || {}) };
  const msg = el("div", { class: "log-line" });
  const sliders = el("div", { class: "stack", style: { gap: "6px" } });
  for (const id of KOKORO_MALE_VOICES.slice(0, 9)) {
    const r = el("input", { type: "range", min: "0", max: "100", step: "5", value: String(Math.round((cfg.blend[id] || 0) * 100)), "aria-label": id });
    const v = el("span", { class: "v" }, r.value);
    r.addEventListener("input", () => { v.textContent = r.value; cfg.blend[id] = +r.value / 100; if (!cfg.blend[id]) delete cfg.blend[id]; delete cfg.customStyle; });
    sliders.append(el("div", { class: "mix" }, el("span", {}, id.replace(/^[ab]m_/, "") + (id.startsWith("bm") ? " (UK)" : " (US)")), r, v));
  }
  const speed = el("input", { type: "range", min: "0.8", max: "1.2", step: "0.05", value: String(cfg.speed), "aria-label": "Speed" });
  speed.addEventListener("input", () => cfg.speed = +speed.value);
  const sample = el("textarea", { rows: "3", id: "sampleText" }); sample.value = SAMPLE;
  const custom = el("input", { type: "file", accept: ".bin", id: "customStyle" });
  custom.addEventListener("change", async () => { const f = custom.files[0]; if (!f) return; cfg.customStyle = b64.fromBytes(new Uint8Array(await f.arrayBuffer())); status(msg, "Custom voice loaded. Preview it, then Save voice.", "ok"); });
  const loadBtn = el("button", { class: "btn", type: "button", onclick: async () => {
    try { status(msg, "Downloading the voice model (about 90 MB, once)…"); previewVoice = previewVoice || new Voice(); previewVoice.ensureAudio(); if (previewVoice.mode !== "kokoro") await previewVoice.load(p => status(msg, `Voice model ${Math.round(p.progress * 100)}%`)); status(msg, "Voice model ready.", "ok"); }
    catch (e) { status(msg, "Voice model couldn't load: " + (e.message || e), "err"); }
  } }, "Load voice engine");
  const prevBtn = el("button", { class: "btn primary", type: "button", onclick: async () => {
    if (previewVoice?.mode !== "kokoro") return status(msg, "Load the voice engine first.", "err");
    try { status(msg, "Generating…"); await previewVoice.setVoice(cfg); previewVoice.stop(); previewVoice.say(sample.value); status(msg, "Playing.", "ok"); } catch (e) { status(msg, e.message || String(e), "err"); }
  } }, "Preview");
  const saveBtn = el("button", { class: "btn", type: "button", onclick: async () => { await idb.set("voice", cfg); status(msg, "Voice saved.", "ok"); } }, "Save voice");

  // recording kit
  const packs = await allPacks();
  const lines = [...INTRO_LINES, ...scriptSentences(packs.flatMap(p => (p.sources || []).flatMap(s => s.chunks || [])), 500)];
  const index = (await idb.get("rec:index")) || {};
  recIdx = Math.min(store.get("recIdx", 0), lines.length - 1);
  const line = el("div", { class: "script-line" });
  const recMsg = el("div", { class: "log-line" });
  const prog = el("div", { class: "muted", style: { fontSize: "13.5px" } });
  const recBtn = el("button", { class: "btn accent", type: "button" }, "● Record line");
  const playBtn = el("button", { class: "btn", type: "button" }, "▶ Play");
  const updateLine = () => {
    line.textContent = lines[recIdx] || "No script lines.";
    const done = Object.values(index); const secs = done.reduce((a, r) => a + r.seconds, 0);
    prog.textContent = `Line ${recIdx + 1} of ${lines.length} · ${done.length} recorded · ${(secs / 60).toFixed(1)} minutes${index[recIdx] ? " · this line is recorded" : ""}`;
    store.set("recIdx", recIdx);
  };
  recBtn.addEventListener("click", async () => {
    if (recorder) { recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      const chunks = []; recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); recorder = null; recBtn.textContent = "● Record line";
        const { wav, seconds, peak } = await toWav(new Blob(chunks, { type: chunks[0]?.type || "audio/webm" }));
        if (seconds < 0.8) return status(recMsg, "That was too short. Try again.", "err");
        await idb.set("rec:" + recIdx, wav); index[recIdx] = { text: lines[recIdx], seconds }; await idb.set("rec:index", index);
        status(recMsg, `Saved ${seconds.toFixed(1)} s${peak < 0.2 ? " (quiet: move closer to the mic)" : ""}.`, "ok");
        recIdx = Math.min(lines.length - 1, recIdx + 1); updateLine();
      };
      recorder.start(); recBtn.textContent = "■ Stop"; status(recMsg, "Recording… read the line naturally, then press Stop.");
    } catch (e) { status(recMsg, "Microphone blocked: " + (e.message || e), "err"); }
  });
  playBtn.addEventListener("click", async () => { const w = await idb.get("rec:" + recIdx) || await idb.get("rec:" + Math.max(0, recIdx - 1)); if (w) new Audio(URL.createObjectURL(w)).play(); });
  const exportBtn = el("button", { class: "btn primary", type: "button", onclick: async () => {
    const keys = Object.keys(index).map(Number).sort((a, b) => a - b); if (!keys.length) return status(recMsg, "Record some lines first.", "err");
    status(recMsg, "Packing…"); const JSZip = (await import(LIBS.jszip)).default; const zip = new JSZip();
    const meta = [];
    for (const k of keys) { const id = String(k + 1).padStart(4, "0"); const w = await idb.get("rec:" + k); if (!w) continue; zip.file(`wavs/${id}.wav`, w); meta.push(`${id}|${index[k].text.replace(/\|/g, " ")}`); }
    zip.file("metadata.csv", meta.join("\n") + "\n");
    zip.file("README.txt", "Voice dataset in LJSpeech layout (22,050 Hz mono WAV + metadata.csv id|text).\nSee docs/VOICE.md in the ai-george-live repo for training a custom voice.\nKeep this file private: it is enough to clone your voice.\n");
    download("my-voice-dataset.zip", await zip.generateAsync({ type: "blob" })); status(recMsg, `Exported ${meta.length} clips.`, "ok");
  } }, "Export recordings (.zip)");
  updateLine();

  box.append(el("h2", {}, "Your voice"),
    el("div", { class: "two" },
      el("div", { class: "stack" }, el("span", { class: "eyebrow" }, "Step 1 · Coach voice that works today"),
        el("p", { class: "muted" }, "Blend open-source Kokoro voices until it sounds closest to you. Students hear this voice until your trained voice is ready. It runs in their browser."),
        el("div", { class: "row" }, loadBtn, prevBtn, saveBtn), sliders, el("label", { class: "f" }, "Speed", speed), el("label", { class: "f" }, "Sample sentence", sample),
        el("label", { class: "f" }, "Custom voice style (.bin from voice training, optional)", custom), msg),
      el("div", { class: "stack" }, el("span", { class: "eyebrow" }, "Step 2 · Record your voice for cloning"),
        el("p", { class: "muted" }, "Read lines from your own course material. 20 minutes is a useful start; 45–60 minutes gives a much closer clone. Quiet room, same mic, same distance. Recordings stay in this browser until you export them."),
        line, el("div", { class: "row" }, recBtn, playBtn,
          el("button", { class: "btn small", type: "button", onclick: () => { recIdx = Math.max(0, recIdx - 1); updateLine(); } }, "← Previous"),
          el("button", { class: "btn small", type: "button", onclick: () => { recIdx = Math.min(lines.length - 1, recIdx + 1); updateLine(); } }, "Skip →")),
        prog, recMsg, el("div", { class: "row" }, exportBtn),
        el("p", { class: "muted", style: { fontSize: "13px" } }, "Next: train a custom voice from this export with the free steps in docs/VOICE.md, then load the result above as a custom voice style."))));
}

/* ---------- 4 · course packs ---------- */
async function allPacks() { const tags = (await idb.get("packs")) || []; const out = []; for (const t of tags) { const p = await idb.get("pack:" + t); if (p) out.push(p); } return out; }
async function savePack(p) { const tags = new Set((await idb.get("packs")) || []); tags.add(p.tag); await idb.set("packs", [...tags]); await idb.set("pack:" + p.tag, p); }
let curTag = store.get("curPack", null), lastLog = "";
async function renderPacks() {
  const box = $("#panel-packs"); box.innerHTML = "";
  const packs = await allPacks(); if (!packs.some(p => p.tag === curTag)) curTag = packs[0]?.tag || null;
  const p = packs.find(x => x.tag === curTag);
  const msg = el("div", { class: "log-line" }, lastLog); lastLog = "";
  const sel = el("select", { "aria-label": "Course pack" }, packs.map(x => el("option", { value: x.tag, selected: x.tag === curTag }, `${x.course?.code || x.tag} · ${x.course?.title || ""} (#${x.tag})`)));
  sel.addEventListener("change", () => { curTag = sel.value; store.set("curPack", curTag); renderPacks(); });
  const imp = el("input", { type: "file", accept: ".json", id: "packJson" });
  imp.addEventListener("change", async () => { try { const d = JSON.parse(await imp.files[0].text()); if (!d.tag || !d.course) throw new Error("Not a course pack (needs tag and course)."); await savePack(d); curTag = d.tag; store.set("curPack", curTag); renderPacks(); } catch (e) { status(msg, e.message, "err"); } });
  const nTag = el("input", { type: "text", placeholder: "tag, e.g. ism410" }), nCode = el("input", { type: "text", placeholder: "ISM 410" }), nTitle = el("input", { type: "text", placeholder: "Network Security" });
  box.append(el("h2", {}, "Course packs"),
    el("p", { class: "muted" }, "One pack per course: course facts, the weekly schedule and the material the coach reads from. Students choose the course on the live room's start screen, or you link straight to it with #tag."),
    el("div", { class: "row" }, packs.length ? sel : el("span", { class: "muted" }, "No packs yet."), el("label", { class: "btn small", style: { cursor: "pointer" } }, "Import pack JSON", el("span", { hidden: true }, imp))),
    el("div", { class: "row" }, nTag, nCode, nTitle, el("button", { class: "btn", type: "button", onclick: async () => { const tag = slug(nTag.value); if (!tag || !nCode.value) return status(msg, "Give the new course a tag and a code.", "err"); await savePack({ tag, course: { code: nCode.value.trim(), title: nTitle.value.trim(), weeks: [] }, sources: [] }); curTag = tag; store.set("curPack", tag); renderPacks(); } }, "New course")), msg);
  if (!p) return;

  const courseTA = el("textarea", { rows: "14", id: "courseJson", class: "mono", style: { fontSize: "12.5px" } }); courseTA.value = JSON.stringify(p.course, null, 1);
  const files = el("input", { type: "file", multiple: true, accept: ".docx,.pptx,.pdf,.txt,.md", id: "srcFiles" });
  const wk = el("select", { "aria-label": "Week" }, el("option", { value: "0" }, "Whole course"), (p.course.weeks || []).map(w => el("option", { value: w.n }, "Week " + w.n)));
  const kind = el("select", { "aria-label": "Kind" }, ["lecture deck", "workbook", "syllabus", "reading notes", "practice", "other"].map(k => el("option", { value: k }, k)));
  const addBtn = el("button", { class: "btn primary", type: "button", onclick: async () => {
    const fl = [...files.files]; if (!fl.length) return status(msg, "Choose files first.", "err");
    const lines = [];
    for (const f of fl) { try { const t = await extractText(f); const chunks = chunkText(t); p.sources = (p.sources || []).filter(s => s.id !== slug(f.name)); p.sources.push({ id: slug(f.name), title: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), week: +wk.value, kind: kind.value, chunks }); lines.push(`✓ ${f.name}: ${chunks.length} passages`); } catch (e) { lines.push(`✗ ${f.name}: ${e.message || e}`); } status(msg, lines.join("\n")); }
    await savePack(p); lastLog = lines.join("\n"); renderPacks();
  } }, "Add files");
  const rows = (p.sources || []).map((s, i) => el("tr", {}, el("td", {}, s.title), el("td", {}, s.week ? "Week " + s.week : "Course"), el("td", {}, s.kind || ""), el("td", { class: "mono" }, String((s.chunks || []).length)),
    el("td", {}, el("button", { class: "btn small danger", type: "button", onclick: async () => { p.sources.splice(i, 1); await savePack(p); renderPacks(); } }, "Remove"))));
  box.append(
    el("div", { class: "two" },
      el("div", { class: "stack" }, el("span", { class: "eyebrow" }, "Material the coach reads"),
        el("p", { class: "banner", style: { margin: 0 } }, "Students can unlock everything in a pack with the class passphrase. Add decks, workbooks, the syllabus and reading notes. Leave out instructor guides, answer keys and graded scenarios."),
        el("label", { class: "f" }, "Files (.docx, .pptx, .pdf, .txt, .md)", files), el("div", { class: "row" }, wk, kind, addBtn),
        el("div", { class: "scroll-x" }, el("table", { class: "t" }, el("thead", {}, el("tr", {}, ["Title", "Scope", "Kind", "Passages", ""].map(h => el("th", {}, h)))), el("tbody", {}, rows)))),
      el("div", { class: "stack" }, el("span", { class: "eyebrow" }, "Course facts and weekly schedule (JSON)"), courseTA,
        el("div", { class: "row" },
          el("button", { class: "btn primary", type: "button", onclick: async () => { try { p.course = JSON.parse(courseTA.value); await savePack(p); status(msg, "Course details saved.", "ok"); } catch { status(msg, "That isn't valid JSON.", "err"); } } }, "Save details"),
          el("button", { class: "btn", type: "button", onclick: () => download(`${p.tag}.pack.json`, new Blob([JSON.stringify(p)], { type: "application/json" })) }, "Back up pack (.json)"),
          el("button", { class: "btn danger", type: "button", onclick: async e => { if (e.currentTarget.dataset.c !== "1") { e.currentTarget.dataset.c = "1"; e.currentTarget.textContent = "Confirm delete"; return; } const tags = ((await idb.get("packs")) || []).filter(t => t !== p.tag); await idb.set("packs", tags); await idb.del("pack:" + p.tag); curTag = null; renderPacks(); } }, "Delete pack")))));
}

/* ---------- 5 · publish ---------- */
async function renderPublish() {
  const box = $("#panel-publish"); box.innerHTML = "";
  const packs = await allPacks(), face = await idb.get("face"), voice = await idb.get("voice"), profile = await getProfile();
  const gh = { owner: "DrGNinja", repo: "ai-george-live", branch: "main", ...(store.get("gh") || {}) };
  const msg = el("div", { class: "log-line" });
  const pass1 = el("input", { type: "password", id: "pp1", autocomplete: "new-password", placeholder: "At least 12 characters" }), pass2 = el("input", { type: "password", id: "pp2", autocomplete: "new-password", placeholder: "Repeat" });
  const checks = packs.map(p => { const c = el("input", { type: "checkbox", checked: true, value: p.tag }); return { c, row: el("label", { class: "row", style: { fontSize: "14px" } }, c, `${p.course.code} · ${p.course.title} (#${p.tag}, ${(p.sources || []).length} files)`) }; });
  const ready = [["Profile", true], ["Face", !!face], ["Voice", !!voice], ["At least one course pack", packs.length > 0]];

  async function build() {
    if (pass1.value.length < 12) throw new Error("Use a passphrase of at least 12 characters.");
    if (pass1.value !== pass2.value) throw new Error("The passphrases don't match.");
    const sel = checks.filter(x => x.c.checked).map(x => packs.find(p => p.tag === x.c.value));
    if (!sel.length) throw new Error("Choose at least one course pack.");
    const files = {};
    files[PATHS.avatar] = await sealJSON({ profile, face: face || null, voice: voice || null, builtAt: new Date().toISOString() }, pass1.value);
    for (const p of sel) files[PATHS.pack(p.tag)] = await sealJSON({ tag: p.tag, course: p.course, instructor: profile, sources: p.sources || [] }, pass1.value);
    files[PATHS.packsIndex] = JSON.stringify(sel.map(p => ({ tag: p.tag, code: p.course.code, title: p.course.title })), null, 1);
    return files;
  }
  const zipBtn = el("button", { class: "btn", type: "button", onclick: async () => {
    try { status(msg, "Encrypting…"); const files = await build(); const JSZip = (await import(LIBS.jszip)).default; const zip = new JSZip(); for (const [k, v] of Object.entries(files)) zip.file(k, v); download("ai-george-publish.zip", await zip.generateAsync({ type: "blob" })); status(msg, "Downloaded. Upload these files to the root of your GitHub repo, keeping the packs folder.", "ok"); }
    catch (e) { status(msg, e.message, "err"); }
  } }, "Download encrypted files (.zip)");

  const owner = el("input", { type: "text", value: gh.owner }), repo = el("input", { type: "text", value: gh.repo }), branch = el("input", { type: "text", value: gh.branch });
  const token = el("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off" }); try { token.value = sessionStorage.getItem("agl_gh_token") || ""; } catch {}
  const ghBtn = el("button", { class: "btn primary", type: "button", onclick: async () => {
    try {
      const cfg = { owner: owner.value.trim(), repo: repo.value.trim(), branch: branch.value.trim() || "main" }; store.set("gh", cfg);
      try { sessionStorage.setItem("agl_gh_token", token.value.trim()); } catch {}
      status(msg, "Encrypting…"); const files = await build(); const lines = [];
      for (const [path, content] of Object.entries(files)) { lines.push("Uploading " + path + "…"); status(msg, lines.join("\n")); await ghPut(cfg, token.value.trim(), path, content); lines[lines.length - 1] = "✓ " + path; status(msg, lines.join("\n")); }
      status(msg, lines.join("\n") + `\nPublished. If GitHub Pages is on, students open https://${cfg.owner.toLowerCase()}.github.io/${cfg.repo}/ in a minute or two.`, "ok");
    } catch (e) { status(msg, e.message || String(e), "err"); }
  } }, "Publish to GitHub");

  box.append(el("h2", {}, "Publish"),
    el("ul", { class: "checks", style: { listStyle: "none", padding: 0 } }, ready.map(([k, ok]) => el("li", {}, ok ? "✅" : "⬜", k))),
    el("div", { class: "two" },
      el("div", { class: "stack" }, el("span", { class: "eyebrow" }, "Class passphrase"),
        el("p", { class: "muted" }, "Everything is encrypted with this passphrase before it leaves the browser. Post it in Canvas for students. Change it each term; publishing again with a new passphrase locks out the old one."),
        el("label", { class: "f" }, "Passphrase", pass1), el("label", { class: "f" }, "Repeat passphrase", pass2),
        el("span", { class: "eyebrow" }, "Courses to publish"), ...checks.map(x => x.row), el("div", { class: "row" }, zipBtn)),
      el("div", { class: "stack" }, el("span", { class: "eyebrow" }, "Publish straight to GitHub (optional)"),
        el("p", { class: "muted" }, "Create a fine-grained personal access token limited to this one repository with Contents: read and write. It is kept only for this browser tab."),
        el("div", { class: "row" }, el("label", { class: "f", style: { flex: "1" } }, "Owner", owner), el("label", { class: "f", style: { flex: "1" } }, "Repository", repo), el("label", { class: "f", style: { width: "110px" } }, "Branch", branch)),
        el("label", { class: "f" }, "Token", token), el("div", { class: "row" }, ghBtn))), msg);
}

async function ghPut({ owner, repo, branch }, token, path, text) {
  if (!token) throw new Error("Paste a GitHub token first.");
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  let sha;
  const cur = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (cur.ok) sha = (await cur.json()).sha; else if (cur.status !== 404) throw new Error(`GitHub said ${cur.status} for ${path}. Check the token's repository access.`);
  const r = await fetch(api, { method: "PUT", headers, body: JSON.stringify({ message: `Publish ${path}`, branch, sha, content: b64.fromBytes(new TextEncoder().encode(text)) }) });
  if (!r.ok) throw new Error(`Upload of ${path} failed (${r.status}): ${(await r.json().catch(() => ({}))).message || ""}`);
}

showTab(store.get("studioTab", "profile"));
