// Live room: unlock a course, load the local models, then run the conversation loop
// (listen → transcribe → guard → retrieve → think → speak with a lip-synced face).

import { $, el, md, speakable, store } from "./util.js";
import { PATHS, BRAINS, TEXT_COACH_URL } from "./config.js";
import { openJSON } from "./vault.js";
import { buildIndex } from "./retrieval.js";
import { guard, buildMessages, greeting } from "./coach.js";
import { Brain, gpuInfo } from "./brain.js";
import { Mic, Whisper } from "./ears.js";
import { Voice } from "./voice.js";
import { FaceRig } from "./face.js";
import { Presence } from "./presence.js";

const S = { pack: null, avatar: null, index: null, history: [], busy: null, gpu: null, handsFree: false, captions: true };
const brain = new Brain(), whisper = new Whisper(), voice = new Voice();
const face = new FaceRig($("#face"));
let mic = null, presence = null;

$("#textCoach").href = TEXT_COACH_URL;

/* ---------- gate ---------- */
async function initGate() {
  S.gpu = await gpuInfo();
  const pill = $("#gpuPill");
  if (S.gpu.ok) { pill.className = "pill good"; pill.textContent = `Ready · WebGPU${S.gpu.f16 ? " (fast)" : ""}`; }
  else { pill.className = "pill bad"; pill.textContent = "This browser can't run the live coach"; $("#gateMsg").textContent = S.gpu.reason; }
  const tierSel = $("#tier");
  for (const [k, b] of Object.entries(BRAINS)) tierSel.append(el("option", { value: k, selected: k === (store.get("tier") || S.gpu.suggested || "light") }, b.label + (k === S.gpu.suggested ? " · suggested" : "")));
  const sel = $("#course");
  let list = [];
  try { list = await (await fetch(PATHS.packsIndex, { cache: "no-cache" })).json(); } catch {}
  if (!list.length) sel.append(el("option", { value: "" }, "No courses published yet"));
  for (const c of list) sel.append(el("option", { value: c.tag }, `${c.code} · ${c.title}`));
  const want = (location.hash || "").slice(1).toLowerCase() || new URLSearchParams(location.search).get("course");
  if (want && list.some(c => c.tag === want)) sel.value = want;
  const saved = store.get("pass:" + sel.value); if (saved) { $("#pass").value = saved; $("#remember").checked = true; }
  sel.addEventListener("change", () => { $("#pass").value = store.get("pass:" + sel.value) || ""; });
  $("#startBtn").disabled = !S.gpu.ok || !list.length;
  if (!S.gpu.ok) $("#startBtn").textContent = "Live coach unavailable here";
}

function bar(id, label) {
  let b = document.getElementById("bar-" + id);
  if (!b) { b = el("div", { class: "bar", id: "bar-" + id }, el("span", { class: "lbl" }, label), el("div", { class: "track" }, el("i"))); $("#progress").append(b); }
  return { set(p, text) { b.querySelector("i").style.width = Math.round(p * 100) + "%"; if (text) b.querySelector(".lbl").textContent = `${label} · ${text}`; } };
}

async function start() {
  const tag = $("#course").value, pass = $("#pass").value;
  if (!tag) return;
  if (!pass) { $("#gateMsg").textContent = "Enter the class passphrase from Canvas."; return; }
  $("#startBtn").disabled = true; $("#gateMsg").textContent = "Unlocking…";
  try {
    const [packTxt, avTxt] = await Promise.all([fetch(PATHS.pack(tag)).then(r => { if (!r.ok) throw new Error("Course file missing."); return r.text(); }), fetch(PATHS.avatar).then(r => r.ok ? r.text() : null)]);
    S.pack = await openJSON(packTxt, pass);
    S.avatar = avTxt ? await openJSON(avTxt, pass).catch(() => null) : null;
  } catch (e) { $("#gateMsg").textContent = e.message || "Couldn't open the course."; $("#startBtn").disabled = false; return; }
  if ($("#remember").checked) store.set("pass:" + tag, pass); else store.del("pass:" + tag);
  store.set("tier", $("#tier").value);
  S.pack.instructor = { ...(S.pack.instructor || {}), ...(S.avatar?.profile || {}) };
  S.index = buildIndex(S.pack.sources);
  voice.ensureAudio(); // unlock audio inside the click
  $("#gateMsg").textContent = "Loading the AI on this computer. The first time takes a few minutes.";
  $("#progress").hidden = false;
  const bBrain = bar("brain", "Thinking model"), bVoice = bar("voice", "Voice"), bEars = bar("ears", "Listening");
  const loads = [
    brain.load($("#tier").value, S.gpu, p => bBrain.set(p.progress, p.text.slice(0, 60))).then(() => bBrain.set(1, "ready")),
    voice.load(p => bVoice.set(p.progress, "downloading")).then(() => voice.setVoice(S.avatar?.voice || {})).then(() => bVoice.set(1, "ready"))
      .catch(e => { console.warn(e); voice.useBrowserVoice(); bVoice.set(1, "using this browser's voice"); }),
    whisper.load(p => bEars.set(p.progress, "downloading")).then(() => bEars.set(1, "ready")).catch(e => { console.warn(e); bEars.set(0, "unavailable, type instead"); S.noEars = true; })
  ];
  try { await loads[0]; } catch (e) { $("#gateMsg").textContent = "The AI model couldn't start on this computer: " + (e.message || e) + ". Try a smaller model size."; $("#startBtn").disabled = false; return; }
  await Promise.allSettled(loads.slice(1));
  enterRoom();
}

/* ---------- room ---------- */
function setState(kind, text) { $("#stateDot").className = "dot " + (kind || ""); $("#stateText").textContent = text; }
function caption(text) { const c = $("#captions"); c.innerHTML = ""; if (S.captions && text) c.append(el("span", {}, text)); }

function addMsg(who, text) {
  const b = el("div", { class: "b" }); if (who === "ai") b.innerHTML = md(text); else b.textContent = text;
  const m = el("div", { class: "msg " + who }, el("span", { class: "who" }, who === "ai" ? (S.pack.instructor.tutorName || "AI George") : "You"), b);
  $("#log").append(m); $("#log").scrollTop = $("#log").scrollHeight; return b;
}

async function enterRoom() {
  $("#gate").hidden = true; $("#room").hidden = false;
  const I = S.pack.instructor, c = S.pack.course;
  $("#school").textContent = I.school || "AI George Live";
  $("#title").textContent = `${c.code} · ${c.title}`;
  $("#coachName").textContent = I.tutorName || "AI George";
  $("#coachSub").textContent = `AI coach for ${I.name || "your professor"}`;
  if (!(await face.load(S.avatar?.face || (I.photo ? { photo: I.photo, mouth: I.mouth } : null)))) setState("", "No face uploaded yet");
  face.attach(voice.mode === "kokoro" ? voice.analyser : null);
  voice.onStart = () => { face.speaking = true; if (mic) mic.gated = true; setState("talk", "Speaking"); };
  voice.onEnd = () => { face.speaking = false; if (mic) mic.gated = false; setState(S.handsFree ? "listen" : "", S.handsFree ? "Listening" : "Ready"); };
  voice.onBoundary = () => face.boundary();
  for (let i = 0; i < 9; i++) $("#level").append(el("i"));
  if (S.noEars) { $("#micBtn").disabled = true; $("#micBtn").title = "Speech recognition couldn't load; type instead."; }
  const hello = greeting(S.pack);
  addMsg("ai", hello); caption(hello); voice.say(hello);
}

async function ask(text) {
  text = text.trim(); if (!text) return;
  if (S.busy) { S.busy.abort(); voice.stop(); }
  addMsg("me", text);
  const blocked = guard(text, S.pack.instructor.tutorName);
  if (blocked) { addMsg("ai", blocked.reply); caption(blocked.reply); voice.say(blocked.reply); return; }
  const ctl = new AbortController(); S.busy = ctl;
  const { msgs, hits } = buildMessages(S.pack, S.index, S.history, text);
  const bubble = addMsg("ai", ""); bubble.innerHTML = '<span class="muted">Thinking…</span>';
  setState("think", "Thinking");
  const speech = voice.begin();
  let shown = "";
  try {
    const full = await brain.reply(msgs, { signal: ctl.signal, onToken: (d, all) => { shown = all; bubble.innerHTML = md(all); speech.push(d); caption(speakable(all).split(/(?<=[.!?])\s+/).slice(-2).join(" ")); $("#log").scrollTop = $("#log").scrollHeight; } });
    speech.end();
    S.history.push({ role: "user", content: text }, { role: "assistant", content: full });
    if (hits.length) bubble.after(el("span", { class: "src" }, "From: " + [...new Set(hits.map(h => h.title))].join(" · ")));
  } catch (e) {
    speech.end(); bubble.innerHTML = md(shown) + `<p class="muted">Something went wrong: ${e.message || e}</p>`;
  } finally { if (S.busy === ctl) S.busy = null; if (!voice.speaking) setState(S.handsFree ? "listen" : "", S.handsFree ? "Listening" : "Ready"); }
}

/* ---------- controls ---------- */
$("#startBtn").addEventListener("click", start);
$("#compose").addEventListener("submit", e => { e.preventDefault(); const q = $("#q"); const v = q.value; q.value = ""; ask(v); });
$("#q").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#compose").requestSubmit(); } });
$("#stopBtn").addEventListener("click", () => { S.busy?.abort(); voice.stop(); caption(""); });
$("#capBtn").addEventListener("click", e => { S.captions = !S.captions; e.currentTarget.setAttribute("aria-pressed", S.captions); if (!S.captions) caption(""); });
$("#endBtn").addEventListener("click", () => { voice.stop(); mic?.close(); presence?.stop(); location.reload(); });

$("#micBtn").addEventListener("click", async e => {
  const b = e.currentTarget;
  if (S.handsFree) { S.handsFree = false; mic?.stop(); b.setAttribute("aria-pressed", "false"); setState("", "Ready"); return; }
  try {
    if (!mic) mic = new Mic({
      onSpeechStart: () => setState("listen", "Hearing you…"),
      onUtterance: async audio => { setState("think", "Transcribing"); try { const t = await whisper.transcribe(audio); if (t) ask(t); else setState("listen", "Listening"); } catch (err) { console.warn(err); setState("listen", "Listening"); } },
      onLevel: rms => { const bars = $("#level").children; const lv = Math.min(1, rms * 12); for (let i = 0; i < bars.length; i++) bars[i].style.height = (3 + lv * 15 * (0.6 + 0.4 * Math.sin(i * 1.7 + performance.now() / 120))) + "px"; },
      onBargeIn: () => { S.busy?.abort(); voice.stop(); caption(""); setState("listen", "Go ahead"); }
    });
    await mic.start(); mic.gated = voice.speaking;
    S.handsFree = true; b.setAttribute("aria-pressed", "true"); setState("listen", "Listening");
  } catch (err) { setState("", "Microphone blocked"); addMsg("ai", "I can't hear you because the microphone is blocked. Allow microphone access in the browser's address bar, or type your question."); }
});

$("#camBtn").addEventListener("click", async e => {
  const b = e.currentTarget;
  if (presence?.stream) { presence.stop(); b.setAttribute("aria-pressed", "false"); $("#selfOff").hidden = false; return; }
  try {
    presence = presence || new Presence($("#self"), { onChange: here => {
      if (!S.handsFree || !mic) return;
      if (here) { mic.listening = true; setState(voice.speaking ? "talk" : "listen", voice.speaking ? "Speaking" : "Listening"); }
      else { mic.stop(); setState("", "Paused · I'll listen when you're back"); }
    } });
    await presence.start(); b.setAttribute("aria-pressed", "true"); $("#selfOff").hidden = true;
  } catch { $("#selfOff").textContent = "Camera blocked"; }
});

initGate();
