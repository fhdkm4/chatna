import crypto from "crypto";

function getEncryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY or SESSION_SECRET must be set for token encryption");
  }
  return key;
}

function deriveKey(passphrase: string): Buffer {
  return crypto.pbkdf2Sync(passphrase, "jawab-token-enc", 100000, 32, "sha256");
}

export function encryptToken(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const key = deriveKey(getEncryptionKey());
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return { encrypted, iv: iv.toString("hex"), tag };
}

export function decryptToken(encrypted: string, iv: string, tag: string): string {
  const key = deriveKey(getEncryptionKey());
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
