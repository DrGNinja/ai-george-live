// Coaching rules, guardrails and prompt assembly for a small local model.
// Small models follow instructions less reliably than large ones, so the hard limits
// (no grading, no homework writing) are enforced in code before the model is called.

import { retrieve } from "./retrieval.js";
import { todayISO } from "./util.js";

const PRODUCE = /\b(write|draft|do|solve|answer|complete|finish|outline|paraphrase|rewrite|re-?word|proofread|edit|fix|improve|polish|correct|check|review|summari[sz]e)\b/i;
const GRADED = /\b(dq ?\d+|discussion (question|post|board)s?|project ?\d?|proposal|research paper|paper|progress report|final report|report|assignment|homework|essay|presentation|slides?|lab ?\d?|quiz|exam|test questions?|rubric)\b/i;
const GRADE_ASK = /\b(what|which) (grade|score|mark)\b|\b(grade|score|mark|rate|evaluate)\b[^.?!]{0,40}\b(my|this|mine|it)\b|\bwould (this|it|mine) (pass|get|earn)\b|\bhow many points\b/i;
const GIVE_ANSWERS = /\b(give|tell|send|show) me (the )?(answers?|solutions?|answer key)\b|\banswers? (to|for) (dq|discussion|project|the quiz|the exam)/i;

/** Returns null when the message is fine, or {kind, reply} when the coach must decline. */
export function guard(text, coachName = "your coach") {
  const t = String(text);
  if (GRADE_ASK.test(t)) return { kind: "grading", reply: `I can't grade or score anything, and I won't guess how your professor would mark it. What I can do is help you check your understanding of the concept behind it. Which idea do you want to test yourself on?` };
  if (GIVE_ANSWERS.test(t) || (PRODUCE.test(t) && GRADED.test(t))) return { kind: "homework", reply: `That sounds like graded work, so I can't write, solve or review it. I can still coach you: tell me which concept it depends on and I'll explain it with a different example, or ask you a few questions so you can work it out yourself.` };
  if (t.length > 1100) return { kind: "paste", reply: `That's a long passage. If it's an assignment or your draft, I can't work on it directly. Tell me in a sentence or two which concept you're stuck on and I'll explain it.` };
  return null;
}

export function currentWeek(course) {
  const ws = course?.weeks || []; if (!ws.length) return null;
  const t = todayISO(); let cur = ws[0];
  for (const w of ws) { const lead = new Date(w.start + "T00:00:00"); lead.setDate(lead.getDate() - 2); if (t >= lead.toISOString().slice(0, 10)) cur = w; }
  return cur;
}

const shortName = n => { const p = String(n || "your professor").trim().split(/\s+/); return /^(dr\.?|prof\.?|professor)$/i.test(p[0]) && p.length > 1 ? "Dr. " + p[p.length - 1] : p.join(" "); };

export function systemPrompt(pack) {
  const c = pack.course || {}, I = pack.instructor || {}, w = currentWeek(c);
  const name = I.tutorName || "AI George";
  const week = w ? `Current week: Week ${w.n}, ${w.title} (${w.range}). Topics: ${(w.days || []).map(d => d.topic.split(":")[0]).join("; ")}. Due: ${(w.due || []).map(d => d.when + ": " + d.items.join(", ")).join(" | ")}.` : "";
  return `You are ${name}, a friendly AI learning coach for ${shortName(I.name)}'s course ${c.code} ${c.title}. You are an AI, not the professor; say so if asked.
You speak out loud in a video call, so answer in 2 to 4 short sentences, or at most 3 brief bullet points. No tables, no code.
Do: explain concepts simply with a small example, ask one question to check understanding, point to the right week's materials, give general cybersecurity, risk and AI-governance explanations (NIST, ISO, EU AI Act, HIPAA, PCI DSS).
Never: grade or score anything; write, outline, solve, check or improve any graded work (discussion questions, projects, proposals, papers, reports, presentations); invent deadlines, page numbers or rules. For grades, extensions or personal matters, tell the student to email ${I.email || "the professor"}.
If course notes are given, base your answer on them. If you are not sure, say so and suggest checking Canvas or the professor.
${week}`;
}

/** Build the message list for the model: system, a short history, then notes + the student's question. */
export function buildMessages(pack, index, history, question) {
  const w = currentWeek(pack.course);
  const hits = retrieve(index, question + " " + history.slice(-2).map(h => h.content).join(" "), { week: w?.n || 0 });
  const notes = hits.length ? "Course notes:\n" + hits.map(h => `[${h.title}] ${h.text}`).join("\n\n") + "\n\n" : "";
  const msgs = [{ role: "system", content: systemPrompt(pack) }];
  for (const h of history.slice(-4)) msgs.push(h);
  msgs.push({ role: "user", content: `${notes}Student: ${question}` });
  return { msgs, hits };
}

export function greeting(pack) {
  const c = pack.course || {}, I = pack.instructor || {}, w = currentWeek(c);
  return `Hi, I'm ${I.tutorName || "AI George"}, an AI coach for ${shortName(I.name)}'s ${c.code}.${w ? ` We're in week ${w.n}, ${w.title}.` : ""} Ask me about anything from class. I won't grade or write homework, but I'll help you understand it.`;
}
