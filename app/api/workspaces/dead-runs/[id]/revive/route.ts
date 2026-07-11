import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { reviveDeadRun } from "@/lib/revive-dead-run";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";
import { notifyUserActionRequest } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    const { id } = await params;
    const result = await reviveDeadRun(workspace.id, id, { ...(await req.json()), requestedBy: session.email });
    await audit({ workspaceId: workspace.id, actor: session.email, subjectKind: "dead_run", subjectId: id, event: "resolution_requested", detail: { actionRequestId: result.request.id, recipientSubject: result.request.recipient.subjectId } });
    void notifyUserActionRequest(result.request);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not revive run" }, { status });
  }
}
