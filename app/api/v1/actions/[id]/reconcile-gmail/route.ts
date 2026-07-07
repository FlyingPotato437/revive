import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getAction, reconcileAction, TransitionError } from "@/lib/control-plane";
import { reconcileGmailSentMail } from "@/lib/reconcile/gmail";
import { nangoIntegrationAvailable } from "@/lib/integrations/providers";
import { loadConnectionBinding } from "@/lib/hosted";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/actions/:id/reconcile-gmail — Gmail flavor of provider
// reconciliation for an uncertain mail action. Same contract as
// reconcile-graph: "committed" marks the ledger reconciled with the remote id.
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
  const action = await getAction(auth.workspace.id, id, auth.projectId);
  if (!action) return NextResponse.json({ error: "unknown action" }, { status: 404 });
  const binding = await loadConnectionBinding(action.connectionId, auth.workspace.id);
  const integrationId = String(body.integrationId || binding?.integrationId || "");
  if (binding?.integrationId && integrationId !== binding.integrationId) {
    return NextResponse.json({ error: "the Nango integration does not match the action connection" }, { status: 409 });
  }
  if (!(await nangoIntegrationAvailable(auth.workspace.id, integrationId))) {
    return NextResponse.json({ error: "the Nango integration is not registered for this workspace" }, { status: 400 });
  }
  const result = await reconcileGmailSentMail({
    integrationId,
    connectionId: action.connectionId,
    messageId: body.messageId ? String(body.messageId) : undefined,
    rfc822MessageId: body.rfc822MessageId ? String(body.rfc822MessageId) : undefined,
    subject: body.subject ? String(body.subject) : undefined,
    windowMinutes: typeof body.windowMinutes === "number" ? body.windowMinutes : undefined,
  });
  if (result.outcome === "committed") {
    try {
      await reconcileAction(auth.workspace.id, id, { remoteId: result.remoteId, note: `gmail:${result.strategy}: ${result.detail}`.slice(0, 300) }, auth.projectId);
    } catch (error) {
      if (!(error instanceof TransitionError)) throw error;
    }
  }
  await audit({
    workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "action", subjectId: id,
    event: "provider_reconciled",
    detail: { provider: "gmail", outcome: result.outcome, strategy: result.strategy, remoteId: result.remoteId },
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
