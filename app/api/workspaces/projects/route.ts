import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { createProject, selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export async function POST(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspace = selectedWorkspace(session.email, request.cookies.get(WORKSPACE_COOKIE)?.value);
    return NextResponse.json({ project: createProject(session.email, workspace.id, String(body.name || "")) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create project" }, { status: 400 });
  }
}
