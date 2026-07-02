import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { listWorkspaces, WORKSPACE_COOKIE } from "@/lib/workspaces";

export async function POST(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const workspace = (await listWorkspaces(session.email)).find((item) => item.id === body.workspaceId);
  if (!workspace) return NextResponse.json({ error: "workspace not found" }, { status: 404 });
  const response = NextResponse.json({ ok: true, workspaceId: workspace.id });
  response.cookies.set(WORKSPACE_COOKIE, workspace.id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
