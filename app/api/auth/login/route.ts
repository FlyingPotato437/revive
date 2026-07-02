import { NextRequest, NextResponse } from "next/server";
import { createSession, sessionCookieOptions, SESSION_COOKIE, verifyUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const { email = "", password = "" } = body;
  const result = await verifyUser(email, password);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: 401 });

  const res = NextResponse.json({ ok: true, email: email.trim().toLowerCase() });
  res.cookies.set(
    SESSION_COOKIE,
    createSession(email.trim().toLowerCase()),
    sessionCookieOptions,
  );
  return res;
}
