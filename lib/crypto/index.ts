import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for connector tokens at rest (Phase 6). The key comes
 * from TOKEN_ENCRYPTION_KEY (64 hex chars = 32 bytes). Tokens are never stored
 * or logged in plaintext.
 *
 * Ciphertext format (base64): iv(12) || authTag(16) || ciphertext.
 */
const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function key(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes).");
  }
  return Buffer.from(hex, "hex");
}

export function encryptionEnabled(): boolean {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  return !!hex && hex.length === 64;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const enc = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
