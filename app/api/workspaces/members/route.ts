import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { listWorkspaceMembers, removeWorkspaceMember, requireWorkspaceRole, setWorkspaceMember, type WorkspaceRole } from "@/lib/rbac";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { sendWorkspaceInvite } from "@/lib/notify";

export const runtime = "nodejs";

async function context(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return null;
  return { session, workspace: await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value) };
}

export async function GET(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await requireWorkspaceRole(ctx.session.email, ctx.workspace, "viewer");
    return NextResponse.json({ members: await listWorkspaceMembers(ctx.workspace) });
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await requireWorkspaceRole(ctx.session.email, ctx.workspace, "admin");
    const body = await req.json() as { email?: string; role?: WorkspaceRole };
    if (!body.role || !["viewer", "operator", "admin"].includes(body.role)) throw new Error("role must be viewer, operator, or admin");
    const email = String(body.email || "").trim().toLowerCase();
    await setWorkspaceMember(ctx.workspace, email, body.role as "viewer" | "operator" | "admin");
    // Fire-and-forget invite; never block the membership write on email delivery.
    const invited = await sendWorkspaceInvite({
      email, role: body.role, workspaceName: ctx.workspace.name, inviterEmail: ctx.session.email,
    }).catch(() => ({ email: false, slack: false }));
    return NextResponse.json({ ok: true, invited });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "forbidden";
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not update member" }, { status: forbidden ? 403 : 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await context(req);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await requireWorkspaceRole(ctx.session.email, ctx.workspace, "admin");
    const body = await req.json() as { email?: string };
    await removeWorkspaceMember(ctx.workspace, String(body.email || ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "forbidden";
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not remove member" }, { status: forbidden ? 403 : 400 });
  }
}
