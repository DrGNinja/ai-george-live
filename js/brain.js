// Local language model via WebLLM (WebGPU). Downloads once, then cached by the browser.

import { LIBS, BRAINS } from "./config.js";

export async function gpuInfo() {
  if (!("gpu" in navigator)) return { ok: false, reason: "This browser has no WebGPU. Use Chrome or Edge on a laptop or desktop." };
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return { ok: false, reason: "WebGPU is present but no graphics adapter is available." };
    const f16 = adapter.features.has("shader-f16");
    const maxBuf = adapter.limits?.maxBufferSize || 0;
    const mem = navigator.deviceMemory || 8;
    const suggested = mem >= 8 && maxBuf >= 1024 ** 3 ? "standard" : mem >= 4 ? "light" : "tiny";
    return { ok: true, f16, maxBuf, mem, suggested };
  } catch (e) { return { ok: false, reason: "WebGPU couldn't start: " + (e?.message || e) }; }
}

export class Brain {
  constructor() { this.engine = null; this.modelId = null; this.busy = null; }

  async load(tier, gpu, onProgress) {
    const b = BRAINS[tier] || BRAINS.light;
    const id = gpu?.f16 ? b.f16 : b.f32;
    if (this.engine && this.modelId === id) return id;
    const webllm = await import(LIBS.webllm);
    const worker = new Worker(new URL("./llm-worker.js", import.meta.url), { type: "module" });
    this.engine = await webllm.CreateWebWorkerMLCEngine(worker, id, {
      initProgressCallback: p => onProgress?.({ progress: p.progress ?? 0, text: p.text || "" })
    });
    this.modelId = id;
    return id;
  }

  /** Stream a reply. onToken receives each new text piece. Returns the full text. */
  async reply(messages, { onToken, signal } = {}) {
    if (!this.engine) throw new Error("The model isn't loaded yet.");
    let full = "";
    const chunks = await this.engine.chat.completions.create({ messages, stream: true, temperature: 0.4, top_p: 0.9, max_tokens: 320 });
    for await (const ch of chunks) {
      if (signal?.aborted) { try { await this.engine.interruptGenerate(); } catch {} break; }
      const d = ch.choices?.[0]?.delta?.content || "";
      if (d) { full += d; onToken?.(d, full); }
    }
    return full.trim();
  }
}
