import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { listDeadRuns } from "@/lib/dead-runs";
import { listWorkspaceMembers, requireWorkspaceRole } from "@/lib/rbac";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supplies safe form options only. Raw traces and action context never leave
// the server; selecting a blocker fills its immutable continuation coordinates.
export async function GET(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    const [runs, members] = await Promise.all([
      listDeadRuns(workspace.id).catch(() => []),
      listWorkspaceMembers(workspace).catch(() => []),
    ]);
    return NextResponse.json({
      blockers: runs
        .filter((run) => run.recoverable && run.status === "detected")
        .slice(0, 100)
        .map((run) => ({
          id: run.id,
          runId: run.runId,
          checkpointId: run.checkpointId,
          generation: run.generation,
          actionType: run.suggestedActionType,
          title: run.suggestedQuestion,
          category: run.category,
          recipientRole: run.suggestedRecipientRole,
        })),
      recipients: members.map((member) => ({ email: member.email, subjectId: member.email, role: member.role })),
    });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "request options unavailable" }, { status });
  }
}
