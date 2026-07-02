import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { listDeadJobs, retryDeadJob } from "@/lib/hosted";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    return NextResponse.json({ jobs: await listDeadJobs(workspace.id) });
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
}

export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    const body = await req.json().catch(() => ({})) as { jobId?: string };
    const retried = await retryDeadJob(workspace.id, String(body.jobId || ""));
    return retried ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "dead job not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
}
