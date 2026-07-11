import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { analyzeDeadRun } from "@/lib/dead-runs";
import { TransitionError } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "viewer");
    const body = await req.json();
    const analysis = await analyzeDeadRun({ failureMessage: String(body.failureMessage || ""), trace: body.trace });
    return NextResponse.json({ analysis });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not analyze trace" }, { status });
  }
}
