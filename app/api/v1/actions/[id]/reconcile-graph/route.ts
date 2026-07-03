import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getAction, reconcileAction, TransitionError } from "@/lib/control-plane";
import { reconcileGraphSentMail } from "@/lib/reconcile/graph";
import { allowedNangoIntegrations } from "@/lib/integrations/nango";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/actions/:id/reconcile-graph performs provider reconciliation for an
// uncertain Microsoft Graph mail action. Asks the provider whether the side
// effect committed; on "committed" the ledger is marked reconciled with the
// remote id, so the next registration returns already_committed instead of
// reconcile_first. On "not_found" the caller may safely re-execute.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const action = await getAction(auth.workspace.id, id);
  if (!action) return NextResponse.json({ error: "unknown action" }, { status: 404 });
  const integrationId = String(body.integrationId || allowedNangoIntegrations()[0] || "");
  if (!allowedNangoIntegrations().includes(integrationId)) {
    return NextResponse.json({ error: "the Nango integration is not allowlisted" }, { status: 400 });
  }
  const result = await reconcileGraphSentMail({
    integrationId,
    connectionId: action.connectionId,
    messageId: body.messageId ? String(body.messageId) : undefined,
    internetMessageId: body.internetMessageId ? String(body.internetMessageId) : undefined,
    subject: body.subject ? String(body.subject) : undefined,
    windowMinutes: typeof body.windowMinutes === "number" ? body.windowMinutes : undefined,
  });
  if (result.outcome === "committed") {
    try {
      await reconcileAction(auth.workspace.id, id, { remoteId: result.remoteId, note: `graph:${result.strategy}: ${result.detail}`.slice(0, 300) });
    } catch (error) {
      if (!(error instanceof TransitionError)) throw error;
      // Already reconciled/completed is fine because the provider agrees.
    }
  }
  await audit({
    workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "action", subjectId: id,
    event: "provider_reconciled",
    detail: { provider: "microsoft-graph", outcome: result.outcome, strategy: result.strategy, remoteId: result.remoteId },
  });
  return NextResponse.json({
    actionId: id,
    outcome: result.outcome,
    strategy: result.strategy,
    remoteId: result.remoteId,
    detail: result.detail,
    replayVerdict: result.outcome === "committed" ? "already_committed" : result.outcome === "not_found" ? "safe_to_execute" : "reconcile_first",
  });
}
