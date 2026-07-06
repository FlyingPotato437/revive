import { NextRequest, NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

// Fast Revive-cookie presence check at the edge. The /app server layout does
// full HMAC verification. When Clerk is configured, its middleware also makes
// the hosted identity available to the server-side session bridge.
function requireReviveSession(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/app")) return NextResponse.next();
  const token = req.cookies.get("revive_session")?.value;
  if (!token) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

const clerkEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

const middleware = clerkEnabled
  ? clerkMiddleware(async (_auth, req) => requireReviveSession(req))
  : requireReviveSession;

export default middleware;

export const config = {
  matcher: ["/app", "/app/:path*", "/sso/:path*", "/sign-up/:path*", "/api/auth/clerk/:path*", "/__clerk/:path*"],
};
