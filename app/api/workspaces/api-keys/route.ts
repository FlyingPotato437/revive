import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { createApiKey, revokeApiKey, selectedWorkspace, WORKSPACE_COOKIE, type ApiKeyRole } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspace = await selectedWorkspace(session.email, request.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "admin");
    const expiresInDays = body.expiresInDays === undefined || body.expiresInDays === null || body.expiresInDays === "never"
      ? undefined
      : Number(body.expiresInDays);
    const result = await createApiKey(session.email, workspace.id, String(body.name || ""), {
      expiresInDays,
      projectId: String(body.projectId || ""),
      role: String(body.role || "operator") as ApiKeyRole,
    });
    return NextResponse.json({ key: result.key, record: { ...result.record, hash: undefined } }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create API key" }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspace = await selectedWorkspace(session.email, request.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "admin");
    await revokeApiKey(session.email, workspace.id, String(body.keyId || ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revoke API key" }, { status });
  }
}
