import { NextRequest, NextResponse } from "next/server";

// Fast presence check at the edge; the /app server layout does full HMAC verify.
export function middleware(req: NextRequest) {
  const token = req.cookies.get("revive_session")?.value;
  if (!token) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/app/:path*"],
};
