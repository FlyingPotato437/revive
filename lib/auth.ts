// ---------------------------------------------------------------------------
// Lightweight auth for the local console.
// - In-memory user store (survives HMR via globalThis; resets on server restart)
// - scrypt-hashed passwords
// - HMAC-signed session cookie
//
// This is demo-grade (no external DB / OAuth provider so the app is fully
// self-contained), but signup → login → gated dashboard → logout all really work.
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import { applicationSecret } from "./secrets";

export const SESSION_COOKIE = "revive_session";

// Hosted deployments should supply REVIVE_SECRET through their secret manager.
// The local console creates a 0600 workspace secret instead of using a known
// source-code fallback.
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days (seconds)

interface User {
  email: string;
  name: string;
  salt: string;
  hash: string;
  createdAt: number;
}

interface AuthStore {
  users: Map<string, User>;
}

const g = globalThis as unknown as { __reviveAuth?: AuthStore };
const store: AuthStore =
  g.__reviveAuth ?? (g.__reviveAuth = { users: new Map() });

function hashPw(pw: string, salt: string) {
  return crypto.scryptSync(pw, salt, 64).toString("hex");
}

export function createUser(
  email: string,
  password: string,
  name?: string,
): { ok: boolean; error?: string } {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, error: "Enter a valid email address." };
  if (password.length < 6)
    return { ok: false, error: "Password must be at least 6 characters." };
  if (store.users.has(email))
    return { ok: false, error: "An account with that email already exists." };
  const salt = crypto.randomBytes(16).toString("hex");
  store.users.set(email, {
    email,
    name: name?.trim() || email.split("@")[0],
    salt,
    hash: hashPw(password, salt),
    createdAt: Date.now(),
  });
  return { ok: true };
}

export function verifyUser(
  email: string,
  password: string,
): { ok: boolean; error?: string } {
  email = email.trim().toLowerCase();
  const u = store.users.get(email);
  if (!u) return { ok: false, error: "No account found for that email." };
  const candidate = hashPw(password, u.salt);
  const a = Buffer.from(candidate);
  const b = Buffer.from(u.hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { ok: false, error: "Incorrect password." };
  return { ok: true };
}

export function getUser(email: string): User | undefined {
  return store.users.get(email.trim().toLowerCase());
}

// --- session token ---------------------------------------------------------

function sign(payload: string) {
  return crypto.createHmac("sha256", applicationSecret()).update(payload).digest("base64url");
}

export function createSession(email: string): string {
  const body = Buffer.from(
    JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySession(token: string | undefined): { email: string } | null {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = Buffer.from(sign(body));
  const supplied = Buffer.from(mac || "");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data.email || (data.exp && data.exp < Math.floor(Date.now() / 1000)))
      return null;
    return { email: data.email };
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
