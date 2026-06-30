import { NextRequest, NextResponse } from "next/server";
import { approveReconsent } from "@/lib/engine";
import { sessionForTicket } from "@/lib/store";
import { entraConfigured } from "@/lib/oauth/entra";

export const dynamic = "force-dynamic";

// GET → ticket details (the re-consent page reads this to render the consent screen)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticket: string }> },
) {
  const { ticket } = await params;
  const session = sessionForTicket(ticket);
  if (!session) return NextResponse.json({ error: "unknown ticket" }, { status: 404 });
  const t = session.revive.ticket;
  if (!t || t.id !== ticket) {
    return NextResponse.json({ error: "ticket not active" }, { status: 410 });
  }
  if (Date.now() >= t.expiresAt || t.status !== "open") {
    return NextResponse.json({ error: "ticket expired or consumed" }, { status: 410 });
  }
  const realEntra = t.provider === "microsoft" && entraConfigured();
  return NextResponse.json({
    ticket: t,
    classifier: session.revive.classifier,
    authorization: {
      mode: realEntra ? "entra_pkce" : "sandbox",
      url: realEntra ? `/api/oauth/entra/start?ticket=${encodeURIComponent(ticket)}` : null,
    },
  });
}

// POST → consume the one-time request, rotate the lease, and resume out-of-band
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ ticket: string }> },
) {
  const { ticket } = await params;
  const session = sessionForTicket(ticket);
  if (session?.revive.ticket?.provider === "microsoft" && entraConfigured()) {
    return NextResponse.json({ ok: false, reason: "complete Microsoft Entra authorization" }, { status: 409 });
  }
  const result = approveReconsent(ticket);
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result);
}
