// ---------------------------------------------------------------------------
// Console authentication.
// - Durable user store: Postgres when DATABASE_URL is configured, otherwise an
//   atomic 0600 JSON file under .revive/ (survives restarts either way).
// - scrypt-hashed passwords, constant-time compares.
// - HMAC-signed session cookie.
// Clerk can provide the hosted sign-in ceremony when configured. Revive still
// mints this short-lived application session so existing workspace RBAC stays
// consistent across password, sandbox, and SSO entry points.
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { applicationSecret } from "./secrets";
import { hostedDatabaseEnabled, sqlClient } from "./hosted";

export const SESSION_COOKIE = "revive_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days (seconds)

interface User {
  email: string;
  name: string;
  salt: string;
  hash: string;
  createdAt: number;
}

// --- durable storage ---------------------------------------------------------

const directory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
const usersFile = path.join(directory, "users.json");

function readLocal(): Record<string, User> {
  try {
    return JSON.parse(fs.readFileSync(usersFile, "utf8")) as Record<string, User>;
  } catch {
    return {};
  }
}

function writeLocal(users: Record<string, User>): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${usersFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, usersFile);
}

async function loadUser(email: string): Promise<User | null> {
  if (hostedDatabaseEnabled()) {
    const rows = await sqlClient()<User[]>`
      select email, name, salt, hash, extract(epoch from created_at) * 1000 as "createdAt"
      from revive_users where email = ${email} limit 1
    `;
    if (rows.length) return rows[0];
    // fall through to local so pre-database accounts keep working
  }
  return readLocal()[email] ?? null;
}

async function storeUser(user: User): Promise<void> {
  if (hostedDatabaseEnabled()) {
    // Postgres is the store of record. Do NOT touch the local filesystem here:
    // on serverless hosts (Vercel) the app directory is read-only and the write
    // throws EROFS, which previously turned signup into a 500.
    await sqlClient()`
      insert into revive_users (email, name, salt, hash)
      values (${user.email}, ${user.name}, ${user.salt}, ${user.hash})
      on conflict (email) do nothing
    `;
    return;
  }
  const users = readLocal();
  users[user.email] = user;
  writeLocal(users);
}

// --- password hashing ----------------------------------------------------------

function hashPw(pw: string, salt: string) {
  return crypto.scryptSync(pw, salt, 64).toString("hex");
}

export async function createUser(
  email: string,
  password: string,
  name?: string,
): Promise<{ ok: boolean; error?: string }> {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, error: "Enter a valid email address." };
  if (password.length < 8)
    return { ok: false, error: "Password must be at least 8 characters." };
  if (await loadUser(email))
    return { ok: false, error: "An account with that email already exists." };
  const salt = crypto.randomBytes(16).toString("hex");
  await storeUser({
    email,
    name: name?.trim() || email.split("@")[0],
    salt,
    hash: hashPw(password, salt),
    createdAt: Date.now(),
  });
  return { ok: true };
}

export async function verifyUser(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  email = email.trim().toLowerCase();
  const user = await loadUser(email);
  // Constant-time-ish: hash against a dummy salt when the user is unknown so
  // response timing does not reveal account existence.
  const salt = user?.salt ?? "0".repeat(32);
  const candidate = hashPw(password, salt);
  const expected = user?.hash ?? candidate.replace(/./g, "0");
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!user || !match) return { ok: false, error: "Invalid email or password." };
  return { ok: true };
}

export async function getUser(email: string): Promise<User | null> {
  return loadUser(email.trim().toLowerCase());
}

// --- session token ---------------------------------------------------------

function sign(payload: string) {
  return crypto.createHmac("sha256", applicationSecret()).update(payload).digest("base64url");
}

export type ConsoleAuthMode = "password" | "clerk" | "sandbox";

export function createSession(email: string, authMode: ConsoleAuthMode = "password"): string {
  const body = Buffer.from(
    JSON.stringify({ email, authMode, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySession(token: string | undefined): { email: string; authMode: ConsoleAuthMode } | null {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = Buffer.from(sign(body));
  const supplied = Buffer.from(mac || "");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data.email || (data.exp && data.exp < Math.floor(Date.now() / 1000)))
      return null;
    const authMode: ConsoleAuthMode = data.authMode === "clerk" || data.authMode === "sandbox"
      ? data.authMode
      : "password";
    return { email: data.email, authMode };
  } catch {
    return null;
  }
}

export function sessionFromCookies(cookies: { get(name: string): { value: string } | undefined }) {
  return verifySession(cookies.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL,
};
