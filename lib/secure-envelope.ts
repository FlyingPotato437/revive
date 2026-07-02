import crypto from "node:crypto";
import { activeEncryptionKey, encryptionKey, encryptionKeyById } from "./secrets";

const VERSION = "v2";

export function sealJson(value: unknown, purpose: string): string {
  const active = activeEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", active.key, iv);
  cipher.setAAD(Buffer.from(`${VERSION}:${active.id}:${purpose}`));
  const plaintext = Buffer.from(JSON.stringify(value));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [VERSION, active.id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openJson<T>(envelope: string, purpose: string): T {
  const parts = envelope.split(".");
  const version = parts[0];
  const legacy = version === "v1";
  const keyId = legacy ? "legacy" : parts[1];
  const ivRaw = legacy ? parts[1] : parts[2];
  const tagRaw = legacy ? parts[2] : parts[3];
  const ciphertextRaw = legacy ? parts[3] : parts[4];
  if ((version !== "v1" && version !== VERSION) || !keyId || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error("invalid secure envelope");
  const key = legacy ? encryptionKey() : encryptionKeyById(keyId);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(Buffer.from(legacy ? `v1:${purpose}` : `${VERSION}:${keyId}:${purpose}`));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export function sha256Base64Url(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

export function hmacHex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function timingSafeTextEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
