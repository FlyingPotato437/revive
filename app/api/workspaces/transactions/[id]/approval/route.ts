import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { decideTransactionApproval } from "@/lib/outcome-transactions";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    const { id } = await params;
    const body = await req.json();
    const decision = body.decision === "approve" ? "approve" : body.decision === "deny" ? "deny" : null;
    if (!decision) return NextResponse.json({ error: "decision must be approve or deny" }, { status: 400 });
    const transaction = await decideTransactionApproval(workspace.id, id, { decision, actor: session.email, reason: body.reason });
    await audit({ workspaceId: workspace.id, actor: session.email, subjectKind: "transaction", subjectId: id, event: `approval_${decision}d`, detail: { state: transaction.state } });
    return NextResponse.json({ transaction });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not decide transaction" }, { status });
  }
}
