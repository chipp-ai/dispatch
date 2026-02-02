/**
 * Crypto Service
 *
 * AES-256-CTR encryption/decryption compatible with
 * shared/utils-server actionCollectionCrypto.
 */

const ENCRYPTION_KEY =
  Deno.env.get("ACTION_COLLECTION_ENCRYPTION_KEY") ||
  Deno.env.get("ENCRYPTION_KEY") ||
  "default-encryption-key-change-in-production";

const IV_LENGTH = 16;

async function getKey(): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ENCRYPTION_KEY);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

function toHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

export async function encrypt(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await getKey();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "AES-CTR" },
    false,
    ["encrypt"]
  );

  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CTR", counter: iv.buffer as ArrayBuffer, length: 64 },
    cryptoKey,
    encoder.encode(text)
  );

  return toHex(iv) + ":" + toHex(new Uint8Array(encrypted));
}

export async function decrypt(text: string): Promise<string> {
  const parts = text.split(":");
  const iv = fromHex(parts.shift()!);
  const encryptedData = fromHex(parts.join(":"));
  const key = await getKey();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "AES-CTR" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CTR", counter: iv.buffer as ArrayBuffer, length: 64 },
    cryptoKey,
    encryptedData.buffer as ArrayBuffer
  );

  return new TextDecoder().decode(decrypted);
}
