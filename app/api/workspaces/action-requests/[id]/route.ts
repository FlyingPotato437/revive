import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { cancelUserActionRequest, getUserActionRequest } from "@/lib/action-requests";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolve(req, "operator");
  if (!resolved.ok) return resolved.response;
  const { id } = await params;
  const request = await getUserActionRequest(resolved.workspaceId, id, true);
  return request ? NextResponse.json({ request }) : NextResponse.json({ error: "action request not found" }, { status: 404 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolve(req, "operator");
  if (!resolved.ok) return resolved.response;
  try {
    const { id } = await params;
    const request = await cancelUserActionRequest(resolved.workspaceId, id);
    await audit({ workspaceId: resolved.workspaceId, actor: resolved.actor, subjectKind: "action_request", subjectId: id, event: "cancelled" });
    return NextResponse.json({ request });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not cancel action request" }, { status });
  }
}

async function resolve(req: NextRequest, minimum: "viewer" | "operator") {
  const session = sessionFromCookies(req.cookies);
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, minimum);
    return { ok: true as const, workspaceId: workspace.id, actor: session.email };
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return { ok: false as const, response: NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status }) };
  }
}
