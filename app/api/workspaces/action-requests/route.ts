import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { createUserActionRequest, listUserActionRequests } from "@/lib/action-requests";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";
import { notifyUserActionRequest } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const resolved = await resolve(req, "viewer");
  if (!resolved.ok) return resolved.response;
  return NextResponse.json({ requests: await listUserActionRequests(resolved.workspace.id) });
}

export async function POST(req: NextRequest) {
  const resolved = await resolve(req, "operator");
  if (!resolved.ok) return resolved.response;
  try {
    const request = await createUserActionRequest(resolved.workspace.id, { ...(await req.json()), requestedBy: resolved.actor });
    await audit({ workspaceId: resolved.workspace.id, actor: resolved.actor, subjectKind: "action_request", subjectId: request.id, event: "created", detail: { runId: request.runId, actionType: request.actionType, recipientSubject: request.recipient.subjectId, generation: request.generation } });
    void notifyUserActionRequest(request);
    return NextResponse.json({ request }, { status: 201 });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not create action request" }, { status });
  }
}

async function resolve(req: NextRequest, minimum: "viewer" | "operator") {
  const session = sessionFromCookies(req.cookies);
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, minimum);
    return { ok: true as const, workspace, actor: session.email };
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return { ok: false as const, response: NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status }) };
  }
}
