import { NextRequest, NextResponse } from "next/server";
import { createEntraAuthorization, ENTRA_FLOW_COOKIE, entraFlowCookieOptions } from "@/lib/oauth/entra";
import { sessionForTicket } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ticketId = req.nextUrl.searchParams.get("ticket") || "";
  const session = sessionForTicket(ticketId);
  const ticket = session?.revive.ticket;
  if (!ticket || ticket.id !== ticketId || ticket.status !== "open" || ticket.expiresAt <= Date.now()) {
    return NextResponse.json({ error: "recovery ticket is inactive" }, { status: 410 });
  }
  try {
    const authorization = createEntraAuthorization(ticketId);
    const response = NextResponse.redirect(authorization.url);
    response.cookies.set(ENTRA_FLOW_COOKIE, authorization.cookie, entraFlowCookieOptions);
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Entra OAuth is unavailable" }, { status: 503 });
  }
}
