import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { createUserActionRequest, listUserActionRequests } from "@/lib/action-requests";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";
import { notifyUserActionRequest } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "operator");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ requests: await listUserActionRequests(auth.workspace.id, auth.projectId) });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, "operator");
  if (!auth.ok) return auth.response;
  try {
    const request = await createUserActionRequest(auth.workspace.id, {
      ...(await req.json()), projectId: auth.projectId, requestedBy: auth.keyPrefix,
    });
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "action_request", subjectId: request.id, event: "created", detail: { runId: request.runId, checkpointId: request.checkpointId, actionType: request.actionType, recipientSubject: request.recipient.subjectId, generation: request.generation } });
    void notifyUserActionRequest(request);
    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not create action request" }, { status });
  }
}
