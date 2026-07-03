import { NextRequest, NextResponse } from "next/server";
import { approveReconsent } from "@/lib/engine";
import { nangoConfigured } from "@/lib/integrations/nango";
import { loadConnectionBinding } from "@/lib/hosted";
import { resolveRecoveryTarget } from "@/lib/recovery-target";
import { MICROSOFT_GRAPH_RECOVERY_SCOPES } from "@/lib/integrations/nango";

export const dynamic = "force-dynamic";

// GET → ticket details (the re-consent page reads this to render the consent screen)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticket: string }> },
) {
  const { ticket } = await params;
  const target = await resolveRecoveryTarget(ticket);
  if (!target) return NextResponse.json({ error: "ticket expired, consumed, or unknown" }, { status: 410 });
  if (target.kind === "sandbox") {
    // The Playground is a self-contained simulation with a synthetic account,
    // so approval is always simulated. Real provider OAuth belongs to the
    // control-plane recovery path (a real Nango/Entra connection), never here.
    return NextResponse.json({
      ticket: target.ticket,
      classifier: target.session.revive.classifier,
      authorization: { mode: "sandbox", url: null },
    });
  }

  const binding = await loadConnectionBinding(target.record.connectionId, target.record.workspaceId);
  const expiresAt = target.claims.exp * 1000;
  return NextResponse.json({
    ticket: {
      id: ticket,
      runId: target.record.runId,
      sessionId: `control:${target.record.id}`,
      provider: target.record.provider === "google" ? "google" : "microsoft",
      account: binding?.accountId || target.record.connectionId,
      scopes: [...new Set([...(binding?.scopes || []), ...MICROSOFT_GRAPH_RECOVERY_SCOPES])],
      url: target.record.url || `/reauthorize/${ticket}`,
      reason: target.record.reason,
      code: target.record.reason.split(":", 1)[0] || "credential_rejected",
      createdAt: target.record.openedAt,
      expiresAt,
      status: "open",
    },
    authorization: {
      mode: nangoConfigured() ? "nango_connect" : "unavailable",
      url: null,
    },
  });
}

// POST → consume the one-time request, rotate the lease, and resume out-of-band
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ ticket: string }> },
) {
  const { ticket } = await params;
  const target = await resolveRecoveryTarget(ticket);
  if (!target) return NextResponse.json({ ok: false, reason: "recovery request is inactive" }, { status: 410 });
  if (target.kind === "control") {
    return NextResponse.json({ ok: false, reason: "complete authorization through the configured credential vault" }, { status: 409 });
  }
  // Sandbox tickets always simulate the approval and resume the demo run.
  const result = approveReconsent(ticket);
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result);
}
