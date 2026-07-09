/**
 * WebCrypto helpers for client-side E2E encryption of cloud-synced data.
 *
 * Design:
 * - Encryption key = PBKDF2(passphrase, per-user salt, 300k iters, SHA-256) → AES-GCM 256.
 * - Salt is generated once per user and stored on the server (safe — salt is
 *   public by design in PBKDF2, only prevents rainbow tables).
 * - A "key check" ciphertext (encrypted marker string) is also stored so we
 *   can verify a passphrase before pulling any data.
 * - The passphrase itself NEVER leaves the browser. The server holds only
 *   ciphertext + salt + timestamps.
 */

const PBKDF2_ITERS = 300_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_CHECK_MARKER = "miletrack:key-check:v1";

function b64encode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function b64decode(str: string): Uint8Array<ArrayBuffer> {
  const bin = atob(str);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSaltB64(): string {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)));
  return b64encode(salt);
}

export async function deriveKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: b64decode(saltB64),
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface Ciphertext {
  ciphertext: string; // base64
  iv: string; // base64
}

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<Ciphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { ciphertext: b64encode(buf), iv: b64encode(iv) };
}

export async function decryptJSON<T = unknown>(key: CryptoKey, ct: Ciphertext): Promise<T> {
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ct.iv) },
    key,
    b64decode(ct.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}

export async function makeKeyCheck(key: CryptoKey): Promise<Ciphertext> {
  return encryptJSON(key, KEY_CHECK_MARKER);
}

export async function verifyKeyCheck(key: CryptoKey, ct: Ciphertext): Promise<boolean> {
  try {
    const v = await decryptJSON<string>(key, ct);
    return v === KEY_CHECK_MARKER;
  } catch {
    return false;
  }
}
