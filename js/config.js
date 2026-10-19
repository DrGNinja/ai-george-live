// Central configuration: pinned open-source libraries and model choices.
// Everything runs in the visitor's browser. Nothing here needs an API key.

export const LIBS = {
  // Bare names are resolved by the import map in each HTML page, so Whisper and Kokoro share one runtime.
  transformers: "@huggingface/transformers",
  kokoro: "kokoro-js",
  webllm: "https://esm.run/@mlc-ai/web-llm@0.2.84",
  mediapipe: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs",
  mediapipeWasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
  faceLandmarkerModel: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  faceDetectorModel: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
  jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm",
  mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.12.3/mammoth.browser.min.js",
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.min.mjs",
  pdfjsWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs"
};

// Speech-to-text (Whisper, English).
export const STT_MODEL = "Xenova/whisper-base.en";

// Text-to-speech (Kokoro 82M). Voice styles are blended in the Studio.
export const TTS_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const KOKORO_VOICE_URL = id => `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${id}.bin`;
export const KOKORO_MALE_VOICES = ["am_michael", "am_fenrir", "am_puck", "am_echo", "am_eric", "am_liam", "am_onyx", "am_adam", "bm_george", "bm_fable", "bm_lewis", "bm_daniel"];
// The slot whose cached style is replaced by the instructor's blended or custom voice.
export const KOKORO_SLOT = "am_michael";

// Local language models (WebLLM). "f16" builds need the shader-f16 GPU feature.
export const BRAINS = {
  standard: { label: "Standard · Qwen2.5 3B (~2 GB)", f16: "Qwen2.5-3B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-3B-Instruct-q4f32_1-MLC" },
  light: { label: "Light · Qwen2.5 1.5B (~1 GB)", f16: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC" },
  tiny: { label: "Tiny · Qwen2.5 0.5B (~0.4 GB, weakest)", f16: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", f32: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC" }
};

// Where published, encrypted bundles live (relative to the site root).
export const PATHS = { packsIndex: "packs/index.json", pack: tag => `packs/${tag}.enc`, avatar: "avatar.enc" };

// Text-only fallback for phones and browsers without WebGPU (the Claude-based coach).
export const TEXT_COACH_URL = "https://claude.ai/artifact/AWEyyPHmL9Xtvgb97zFcsb";
