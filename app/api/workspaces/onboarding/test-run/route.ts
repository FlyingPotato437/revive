import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { recordDeadRun } from "@/lib/dead-runs";
import { requireWorkspaceRole } from "@/lib/rbac";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUNTIMES = new Set(["langgraph", "temporal", "mcp", "custom"]);

/** Creates a safe synthetic blocker so a new workspace can prove the detector
 * and human-request path before touching a production agent. */
export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const selectedRuntime = String(body.runtime || "langgraph").toLowerCase();
    const runtime = RUNTIMES.has(selectedRuntime) ? selectedRuntime : "custom";
    const suffix = crypto.randomBytes(5).toString("hex");
    const run = await recordDeadRun(workspace.id, {
      projectId: workspace.projects[0]?.id,
      runId: `onboarding_${suffix}`,
      checkpointId: "confirm-billing-contact",
      generation: 1,
      idempotencyKey: `onboarding:${suffix}`,
      runtime: "onboarding",
      failureMessage: "Missing input: a human must confirm the required billing contact email before this agent can continue.",
      trace: { test: true, selectedRuntime, step: "confirm_billing_contact" },
      inputTokens: 1843,
      outputTokens: 217,
      estimatedCostUsd: 0.018,
    }, { deterministic: true });
    await audit({
      workspaceId: workspace.id,
      actor: session.email,
      subjectKind: "dead_run",
      subjectId: run.id,
      event: "onboarding_test_detected",
      detail: { selectedRuntime: runtime, category: run.category, recoverable: run.recoverable },
    });
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not create test blocker" }, { status });
  }
}
