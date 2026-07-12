import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { compileApprovalPolicy } from "@/lib/natural-language-policy";
import { getApprovalPolicy, normalizeApprovalPolicy } from "@/lib/workspace-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compiles natural language into a validated draft. It never persists or
// activates the result; the admin must review and save through the policy API.
export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "admin");
    const body = await req.json() as Record<string, unknown>;
    const instruction = String(body.instruction || "").trim();
    if (instruction.length < 10) return NextResponse.json({ error: "Describe the policy in at least 10 characters." }, { status: 400 });
    if (instruction.length > 2_000) return NextResponse.json({ error: "Policy instructions must be 2,000 characters or fewer." }, { status: 400 });
    const current = body.currentPolicy
      ? normalizeApprovalPolicy(body.currentPolicy)
      : await getApprovalPolicy(workspace.id);
    return NextResponse.json(await compileApprovalPolicy(instruction, current));
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "policy interpretation failed" }, { status });
  }
}
