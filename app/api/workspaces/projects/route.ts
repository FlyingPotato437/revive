import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { createProject, selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspace = await selectedWorkspace(session.email, request.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    return NextResponse.json({ project: await createProject(session.email, workspace.id, String(body.name || "")) }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create project" }, { status });
  }
}
