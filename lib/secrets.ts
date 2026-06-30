import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let cachedSecret: string | undefined;

export function applicationSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.REVIVE_SECRET) {
    if (process.env.NODE_ENV === "production" && process.env.REVIVE_SECRET.length < 32) {
      throw new Error("REVIVE_SECRET must be at least 32 characters in production");
    }
    cachedSecret = process.env.REVIVE_SECRET;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("REVIVE_SECRET is required in production");
  }
  const directory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
  const file = path.join(directory, "auth-secret");
  try {
    cachedSecret = fs.readFileSync(file, "utf8").trim();
  } catch {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    cachedSecret = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  }
  return cachedSecret;
}

export function encryptionKey(): Buffer {
  const configured = process.env.REVIVE_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) throw new Error("REVIVE_ENCRYPTION_KEY must decode to 32 bytes");
    return key;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("REVIVE_ENCRYPTION_KEY is required in production");
  }
  return crypto.createHash("sha256").update(`revive:credentials:${applicationSecret()}`).digest();
}
