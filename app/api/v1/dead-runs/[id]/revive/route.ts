import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { reviveDeadRun } from "@/lib/revive-dead-run";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";
import { notifyUserActionRequest } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, "operator");
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const result = await reviveDeadRun(auth.workspace.id, id, { ...(await req.json()), requestedBy: auth.keyPrefix });
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "dead_run", subjectId: id, event: "resolution_requested", detail: { actionRequestId: result.request.id, recipientSubject: result.request.recipient.subjectId } });
    void notifyUserActionRequest(result.request);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not revive run" }, { status });
  }
}
