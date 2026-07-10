import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

function safeDestination(request: NextRequest): string {
  const requested = request.nextUrl.searchParams.get("next") || "/app/overview";
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/app/overview";
}

export async function GET(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return NextResponse.redirect(new URL("/login?error=sso_unavailable", request.url));
  }
  const identity = await auth();
  if (!identity.userId) {
    const retry = new URL("/sso", request.url);
    retry.searchParams.set("next", safeDestination(request));
    return NextResponse.redirect(retry);
  }
  const client = await clerkClient();
  const user = await client.users.getUser(identity.userId);
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)
    ?? user.emailAddresses[0];
  if (!primary?.emailAddress) {
    return NextResponse.redirect(new URL("/login?error=sso_email_missing", request.url));
  }
  const response = NextResponse.redirect(new URL(safeDestination(request), request.url));
  response.cookies.set(
    SESSION_COOKIE,
    createSession(primary.emailAddress.trim().toLowerCase(), "clerk"),
    sessionCookieOptions,
  );
  return response;
}
