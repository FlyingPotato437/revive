import crypto from "node:crypto";
import { encryptionKey } from "./secrets";

const VERSION = "v1";

export function sealJson(value: unknown, purpose: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${VERSION}:${purpose}`));
  const plaintext = Buffer.from(JSON.stringify(value));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openJson<T>(envelope: string, purpose: string): T {
  const [version, ivRaw, tagRaw, ciphertextRaw] = envelope.split(".");
  if (version !== VERSION || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error("invalid secure envelope");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAAD(Buffer.from(`${VERSION}:${purpose}`));
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
