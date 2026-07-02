import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { listActions, listCases } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

const TERMINAL_RECOVERED = new Set(["completed", "reconciled", "resumed"]);
const TERMINAL_FAILED = new Set(["rejected", "expired", "escalated", "manual_review"]);

// GET /api/workspaces/metrics — agent recovery SLOs computed from the REAL
// case/action ledgers of this workspace. No synthetic numbers: every value is
// derived from recorded transitions, and sample sizes are always returned so
// small denominators are visible.
export async function GET(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let workspaceId: string;
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "viewer");
    workspaceId = workspace.id;
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status });
  }

  const [cases, actions] = await Promise.all([listCases(workspaceId), listActions(workspaceId)]);

  const closed = cases.filter((item) => TERMINAL_RECOVERED.has(item.state) || TERMINAL_FAILED.has(item.state));
  const recovered = closed.filter((item) => TERMINAL_RECOVERED.has(item.state));
  const open = cases.length - closed.length;

  // MTTR: opened → the transition INTO a recovered terminal, from real events.
  const recoveryDurationsMs = recovered
    .map((item) => {
      const done = [...item.events].reverse().find((event) => TERMINAL_RECOVERED.has(String(event.to)));
      return done ? Number(done.at) - item.openedAt : null;
    })
    .filter((value): value is number => typeof value === "number" && value >= 0)
    .sort((a, b) => a - b);
  const meanMs = recoveryDurationsMs.length
    ? Math.round(recoveryDurationsMs.reduce((sum, value) => sum + value, 0) / recoveryDurationsMs.length)
    : null;
  const p95Ms = recoveryDurationsMs.length
    ? recoveryDurationsMs[Math.min(recoveryDurationsMs.length - 1, Math.floor(recoveryDurationsMs.length * 0.95))]
    : null;

  // Duplicate side effects prevented: replays that hit a known outcome
  // (attempts beyond the first on completed/reconciled actions).
  const duplicatesPrevented = actions
    .filter((action) => action.state === "completed" || action.state === "reconciled")
    .reduce((sum, action) => sum + Math.max(0, (action.attempts ?? 1) - 1), 0);
  const uncertainOpen = actions.filter((action) => action.state === "uncertain" || action.state === "started").length;
  const credentialFailures = cases.filter((item) => /aadsts|invalid_grant|credential|token/i.test(item.reason)).length;

  return NextResponse.json({
    scope: "computed from this workspace's recorded cases and action ledger",
    cases: { total: cases.length, open, recovered: recovered.length, failedTerminal: closed.length - recovered.length },
    recoverySuccessRate: closed.length ? Number((recovered.length / closed.length).toFixed(3)) : null,
    meanTimeToRecoverMs: meanMs,
    p95TimeToRecoverMs: p95Ms,
    recoveredSampleSize: recoveryDurationsMs.length,
    unsafeReplaysBlocked: duplicatesPrevented,
    unknownSideEffectsOpen: uncertainOpen,
    credentialFailureCases: credentialFailures,
  });
}
