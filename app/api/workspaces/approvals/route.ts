import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { actionApproval, listActions } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

// GET /api/workspaces/approvals returns the approvals inbox: every action in
// this workspace carrying an approval record, pending first, newest first.
export async function GET(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let workspaceId: string;
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "viewer");
    workspaceId = workspace.id;
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status });
  }
  const actions = await listActions(workspaceId);
  const approvals = actions
    .map((action) => {
      const approval = actionApproval(action);
      return approval
        ? {
            actionId: action.id,
            actionKey: action.actionKey,
            runId: action.runId,
            state: action.state,
            attempts: action.attempts,
            status: approval.status,
            summary: approval.summary,
            requestedBy: approval.requestedBy,
            requestedAt: approval.requestedAt,
            decidedBy: approval.decidedBy,
            decidedAt: approval.decidedAt,
            reason: approval.reason,
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => {
      if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
      return b.requestedAt - a.requestedAt;
    });
  return NextResponse.json({ approvals: approvals.slice(0, 200) });
}
