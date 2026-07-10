import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { evaluateApproval, getApprovalPolicy, normalizeApprovalPolicy } from "@/lib/workspace-config";
import { normalizeRiskContext } from "@/lib/action-contracts";

export const dynamic = "force-dynamic";

// POST evaluates the stored workspace policy without registering an action.
// It powers the settings simulator and deliberately accepts only risk facts.
export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "viewer");
    const body = await req.json() as Record<string, unknown>;
    const actionKey = String(body.actionKey || "").trim().slice(0, 200);
    if (!actionKey) return NextResponse.json({ error: "actionKey is required" }, { status: 400 });
    // The editor previews its in-memory draft, while callers without a draft
    // continue to preview the persisted workspace policy.
    const policy = body.policy
      ? normalizeApprovalPolicy(body.policy)
      : await getApprovalPolicy(workspace.id);
    const decision = evaluateApproval(policy, actionKey, normalizeRiskContext(body.riskContext));
    return NextResponse.json(decision);
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "policy preview unavailable" }, { status });
  }
}
