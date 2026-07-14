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

function configuredKeyring(): Record<string, string> | null {
  let raw = process.env.REVIVE_ENCRYPTION_KEYS;
  if (!raw && process.env.REVIVE_ENCRYPTION_KEYS_FILE) {
    const file = path.resolve(process.env.REVIVE_ENCRYPTION_KEYS_FILE);
    raw = fs.readFileSync(file, "utf8");
  }
  if (!raw) return null;
  let entries: Record<string, string>;
  try {
    entries = JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error("REVIVE_ENCRYPTION_KEYS or REVIVE_ENCRYPTION_KEYS_FILE must contain a JSON object of key IDs to base64 keys");
  }
  if (!entries || Array.isArray(entries) || !Object.keys(entries).length) {
    throw new Error("the encryption keyring must contain at least one key");
  }
  return entries;
}

export function activeEncryptionKey(): { id: string; key: Buffer } {
  const entries = configuredKeyring();
  if (!entries) return { id: "legacy", key: encryptionKey() };
  const id = process.env.REVIVE_ACTIVE_ENCRYPTION_KEY_ID || Object.keys(entries)[0];
  if (!id || !entries[id]) throw new Error("REVIVE_ACTIVE_ENCRYPTION_KEY_ID is not present in the configured keyring");
  const key = Buffer.from(entries[id], "base64");
  if (key.length !== 32) throw new Error(`encryption key ${id} must decode to 32 bytes`);
  return { id, key };
}

export function encryptionKeyById(id: string): Buffer {
  if (id === "legacy") return encryptionKey();
  const entries = configuredKeyring();
  if (!entries) throw new Error(`encryption key ${id} is not configured`);
  const encoded = entries[id];
  if (!encoded) throw new Error(`encryption key ${id} is not configured`);
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error(`encryption key ${id} must decode to 32 bytes`);
  return key;
}
