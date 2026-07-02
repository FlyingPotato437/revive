import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { createWorkspace, listWorkspaces, publicWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ workspaces: (await listWorkspaces(session.email)).map(publicWorkspace) });
}

export async function POST(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspace = await createWorkspace(session.email, {
      name: String(body.name || ""), organization: String(body.organization || ""),
    });
    const response = NextResponse.json({ workspace: publicWorkspace(workspace) }, { status: 201 });
    response.cookies.set(WORKSPACE_COOKIE, workspace.id, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create workspace" }, { status: 400 });
  }
}
