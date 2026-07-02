import { NextRequest, NextResponse } from "next/server";
import { createSession, createUser, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "auth:signup", 5, 60 * 10);
  if (limited) return limited;
  let body: { email?: string; password?: string; name?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const { email = "", password = "", name } = body;
  const created = await createUser(email, password, name);
  if (!created.ok)
    return NextResponse.json({ error: created.error }, { status: 400 });

  const res = NextResponse.json({ ok: true, email: email.trim().toLowerCase() });
  res.cookies.set(
    SESSION_COOKIE,
    createSession(email.trim().toLowerCase()),
    sessionCookieOptions,
  );
  return res;
}
