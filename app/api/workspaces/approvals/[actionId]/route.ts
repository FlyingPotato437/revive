import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { actionApproval, getAction, setActionApproval, TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/workspaces/approvals/:actionId decides a pending approval.
// Body: { decision: "approve" | "deny", reason?: string }. Operator+ only —
// a decision releases (or permanently blocks) a real side effect.
export async function POST(req: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let workspaceId: string;
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    workspaceId = workspace.id;
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status });
  }
  const { actionId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const decision = body.decision === "approve" ? "approved" : body.decision === "deny" ? "denied" : null;
  if (!decision) return NextResponse.json({ error: "decision must be approve or deny" }, { status: 400 });

  const action = await getAction(workspaceId, actionId);
  if (!action) return NextResponse.json({ error: "action not found" }, { status: 404 });
  const approval = actionApproval(action);
  if (!approval) return NextResponse.json({ error: "action has no approval request" }, { status: 409 });
  if (approval.status !== "pending") {
    return NextResponse.json({ error: `approval already ${approval.status}`, status: approval.status }, { status: 409 });
  }
  try {
    const updated = await setActionApproval(workspaceId, actionId, {
      ...approval,
      status: decision,
      decidedBy: session.email,
      decidedAt: Date.now(),
      reason: body.reason ? String(body.reason).slice(0, 300) : undefined,
    });
    await audit({
      workspaceId, actor: session.email, subjectKind: "action", subjectId: actionId,
      event: decision === "approved" ? "approval_granted" : "approval_denied",
      detail: { actionKey: action.actionKey, runId: action.runId },
    });
    const final = actionApproval(updated);
    return NextResponse.json({ actionId, status: final?.status, decidedBy: final?.decidedBy });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
