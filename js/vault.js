// Passphrase encryption for published bundles (course packs, avatar).
// The site is public on GitHub Pages; the bundles are not readable without the class passphrase.
// AES-256-GCM with a key from PBKDF2-SHA256. Content is gzip-compressed before encryption.

import { b64 } from "./util.js";

const ITER = 310000;
const enc = new TextEncoder(), dec = new TextDecoder();

async function deriveKey(pass, salt, iter = ITER) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function gzip(bytes) {
  if (typeof CompressionStream === "undefined") return { bytes, z: false };
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return { bytes: new Uint8Array(await new Response(s).arrayBuffer()), z: true };
}
async function gunzip(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Encrypt any JSON-serialisable value. Returns the text of an .enc file. */
export async function sealJSON(value, pass) {
  if (!pass || pass.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const { bytes, z } = await gzip(enc.encode(JSON.stringify(value)));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  return JSON.stringify({ v: 1, alg: "AES-256-GCM", kdf: "PBKDF2-SHA256", iter: ITER, z, salt: b64.fromBytes(salt), iv: b64.fromBytes(iv), ct: b64.fromBytes(ct) });
}

/** Decrypt an .enc file's text. Throws {code:"bad_pass"} when the passphrase is wrong. */
export async function openJSON(text, pass) {
  const box = typeof text === "string" ? JSON.parse(text) : text;
  if (box.v !== 1) throw new Error("Unknown bundle format.");
  const key = await deriveKey(pass, b64.toBytes(box.salt), box.iter || ITER);
  let plain;
  try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.toBytes(box.iv) }, key, b64.toBytes(box.ct))); }
  catch { const e = new Error("That passphrase doesn't open this course."); e.code = "bad_pass"; throw e; }
  if (box.z) plain = await gunzip(plain);
  return JSON.parse(dec.decode(plain));
}
