import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { actionApproval, getAction } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

// GET /v1/actions/:id returns one ledger entry with its approval state. The
// MCP gateway polls this while a high-risk action waits on a human decision.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const action = await getAction(auth.workspace.id, id, auth.projectId);
  if (!action) return NextResponse.json({ error: "action not found" }, { status: 404 });
  const approval = actionApproval(action);
  return NextResponse.json({
    id: action.id,
    state: action.state,
    attempts: action.attempts,
    resultRef: action.resultRef,
    actionKey: action.actionKey,
    runId: action.runId,
    ...(approval ? { approval: { status: approval.status, requestedAt: approval.requestedAt, decidedBy: approval.decidedBy, decidedAt: approval.decidedAt, reason: approval.reason } } : {}),
  });
}
