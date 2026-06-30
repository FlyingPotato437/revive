import { NextResponse } from "next/server";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Instant guest access for the "Try the live demo" CTA — no signup required.
export async function POST() {
  const email = "guest@revive.dev";
  const res = NextResponse.json({ ok: true, email });
  res.cookies.set(SESSION_COOKIE, createSession(email), sessionCookieOptions);
  return res;
}
