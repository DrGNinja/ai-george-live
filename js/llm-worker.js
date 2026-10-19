// Runs the local language model off the main thread so the face animation stays smooth.
import { WebWorkerMLCEngineHandler } from "https://esm.run/@mlc-ai/web-llm@0.2.84";
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = msg => handler.onmessage(msg);
