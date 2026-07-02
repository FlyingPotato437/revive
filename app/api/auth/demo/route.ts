import { NextRequest, NextResponse } from "next/server";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Instant guest access for the "Try the live demo" CTA — no signup required.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "auth:demo", 30, 60);
  if (limited) return limited;
  const email = "guest@revive.dev";
  const res = NextResponse.json({ ok: true, email });
  res.cookies.set(SESSION_COOKIE, createSession(email), sessionCookieOptions);
  return res;
}
