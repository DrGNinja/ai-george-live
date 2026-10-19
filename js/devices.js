// Camera and microphone access with clear, fixable explanations.
// Nothing here runs on page load: every request starts from a button the user clicks,
// so the browser always shows its own Allow / Block prompt first.

import { el } from "./util.js";

const LABEL = { camera: "camera", microphone: "microphone" };

/** "granted" | "denied" | "prompt" | "unknown" without triggering a prompt. */
export async function permState(name) {
  try { const p = await navigator.permissions.query({ name }); return p.state; } catch { return "unknown"; }
}

function isMac() { return /Mac/i.test(navigator.platform || navigator.userAgent); }

/** Turn a getUserMedia error into steps the person can follow. */
export function explain(err, kind) {
  const what = LABEL[kind] || "camera or microphone";
  const name = err?.name || "";
  if (!window.isSecureContext) return `The ${what} only works on a secure (https) page. Open the site with https://.`;
  if (!navigator.mediaDevices?.getUserMedia) return `This browser can't use a ${what}. Use Chrome or Edge.`;
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return [
      `The ${what} is blocked for this site. To allow it:`,
      `1. Click the icon at the left end of the address bar (it looks like two sliders or a padlock).`,
      `2. Turn on ${what === "camera" ? "Camera" : "Microphone"} (or open Site settings and set it to Allow).`,
      `3. Reload the page and press the button again.`,
      `Still blocked? In Chrome open Settings → Privacy and security → Site settings → ${what === "camera" ? "Camera" : "Microphone"} and make sure sites can ask.` +
      (isMac() ? ` On a Mac, also check System Settings → Privacy & Security → ${what === "camera" ? "Camera" : "Microphone"} → Google Chrome is on, then quit and reopen Chrome.` : ` On Windows, also check Settings → Privacy & security → ${what === "camera" ? "Camera" : "Microphone"} → "Let desktop apps access" is on.`) +
      ` A university-managed computer may block it by policy; try a personal one.`
    ].join("\n");
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return `No ${what} was found. Plug one in or check that it's enabled, then try again.`;
  if (name === "NotReadableError" || name === "TrackStartError") return `The ${what} is busy or turned off by the system. Close Zoom, Teams or other apps using it, then try again.`;
  if (name === "AbortError") return `The ${what} didn't start. Try again.`;
  return `The ${what} couldn't start (${name || "unknown error"}). Reload and try again.`;
}

/** Ask for a stream; on an over-strict constraint, retry with the plain default device. */
export async function getStream(constraints, kind) {
  try { return await navigator.mediaDevices.getUserMedia(constraints); }
  catch (e) {
    if (e?.name === "OverconstrainedError" || e?.name === "ConstraintNotSatisfiedError") {
      return await navigator.mediaDevices.getUserMedia(kind === "camera" ? { video: true, audio: false } : { audio: true });
    }
    const err = new Error(explain(e, kind)); err.name = e?.name; throw err;
  }
}

/** A small "camera & microphone" check panel: shows current state and lets the person test both. */
export function devicePanel({ needCamera = true, needMic = true } = {}) {
  const pill = () => el("span", { class: "pill" }, "Checking…");
  const cam = pill(), mic = pill();
  const out = el("div", { class: "log-line" });
  const show = (node, state) => {
    const map = { granted: ["good", "Allowed"], denied: ["bad", "Blocked"], prompt: ["", "Will ask when needed"], unknown: ["", "Will ask when needed"] };
    const [cls, text] = map[state] || map.unknown; node.className = "pill " + cls; node.textContent = text;
  };
  const refresh = async () => { if (needCamera) show(cam, await permState("camera")); if (needMic) show(mic, await permState("microphone")); };
  const test = el("button", { class: "btn small", type: "button", onclick: async () => {
    out.textContent = ""; out.className = "log-line";
    const results = [];
    for (const [kind, c] of [["camera", { video: true, audio: false }], ["microphone", { audio: true, video: false }]].filter(([k]) => (k === "camera" ? needCamera : needMic))) {
      try { const s = await getStream(c, kind); s.getTracks().forEach(t => t.stop()); results.push(`✓ ${kind} works`); }
      catch (e) { results.push(`✗ ${e.message}`); }
    }
    out.textContent = results.join("\n\n"); out.className = "log-line " + (results.every(r => r.startsWith("✓")) ? "ok" : "err");
    refresh();
  } }, "Test camera & microphone");
  refresh();
  return el("div", { class: "stack", style: { gap: "8px" } },
    el("div", { class: "row" }, needCamera ? el("span", { class: "muted", style: { fontSize: "13.5px" } }, "Camera") : null, needCamera ? cam : null,
      needMic ? el("span", { class: "muted", style: { fontSize: "13.5px", marginLeft: "8px" } }, "Microphone") : null, needMic ? mic : null, test),
    el("p", { class: "muted", style: { fontSize: "12.5px" } }, "Your browser asks before anything turns on. Choose Allow when it asks."),
    out);
}
