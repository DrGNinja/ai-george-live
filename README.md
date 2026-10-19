# AI George Live

A live, talking AI coach for Dr. George Antoniou's ISM courses at Lynn University, built entirely from open-source parts and hosted free on GitHub Pages.

Students open a web page, turn on their microphone (and optionally camera), and talk with an animated coach that looks like their professor and speaks with a voice tuned to his. Everything runs **inside the student's browser**: no server, no API keys, no per-use cost, and no student audio or video leaves their computer.

> The coach explains concepts and gives feedback on reasoning. It never grades and never writes or solves graded work. It always identifies itself as an AI.

## How it works

| Part | Open-source project | Runs on |
|---|---|---|
| Listening | [Whisper](https://huggingface.co/Xenova/whisper-base.en) via [Transformers.js](https://github.com/huggingface/transformers.js) | Student's browser (WebGPU or WASM) |
| Thinking | Qwen2.5 Instruct (0.5B / 1.5B / 3B) via [WebLLM](https://github.com/mlc-ai/web-llm) | Student's GPU (WebGPU) |
| Course knowledge | BM25 search over an encrypted course pack | Student's browser |
| Guardrails | Code-level checks for grading and homework requests, plus coaching rules | Student's browser |
| Voice | [Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) via [kokoro-js](https://github.com/hexgrad/kokoro), with a blended or custom voice style | Student's browser |
| Face | Real, eye-aligned frames of the instructor captured with [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker), blended in time with the voice | Student's browser |
| Presence | MediaPipe Face Detector on the student's camera (self-view only) | Student's browser |
| Hosting | GitHub Pages | Free |

Two pages:

- **`index.html`**: the live room students use.
- **`studio.html`**: the instructor's Studio. Capture your face, set up and record your voice, build course packs, and publish encrypted bundles.

## Repository layout

```
index.html            live room
studio.html           instructor Studio
assets/app.css        styles
js/                   modules (no build step)
packs/index.json      list of published courses
packs/<tag>.enc       encrypted course packs (published from the Studio)
avatar.enc            encrypted face + voice bundle (published from the Studio)
docs/SETUP.md         step-by-step setup for the instructor
docs/VOICE.md         training a custom voice for free
docs/PRIVACY.md       what students should know
docs/TROUBLESHOOTING.md  fixes for blocked sites, camera, mic and slow starts
tools/pt_to_bin.py    convert a trained Kokoro voice style to the browser format
```

**Never commit plain course packs, voice recordings or the class passphrase.** Only the `.enc` files produced by the Studio belong in this repository.

## Requirements for students

Chrome or Edge on a laptop or desktop with WebGPU. The first visit downloads roughly 1–2.5 GB of models, which the browser caches. Phones and older computers can use the text coach linked from the start screen.

## License

MIT for this code. Models and libraries keep their own licenses (Kokoro: Apache-2.0; Qwen2.5: Apache-2.0 for 0.5B/1.5B, Qwen Research License for 3B; Whisper: MIT; MediaPipe: Apache-2.0; WebLLM: Apache-2.0; Transformers.js: Apache-2.0).
