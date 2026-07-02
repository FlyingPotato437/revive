import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/store";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = sessionFromCookies(req.cookies);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  const workspace = await selectedWorkspace(auth.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
  if (session.workspaceId && session.workspaceId !== workspace.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ session });
}
