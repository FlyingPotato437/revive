// The counter: what Revive prevented, from real ledgers only. Every number is
// derived from recorded actions/cases in this workspace — no extrapolation.
// Feeds the console strip, GET /v1/stats/protection, and the weekly summary.

import { actionApproval, listActions, listCases } from "./control-plane";

const TERMINAL_RECOVERED = new Set(["completed", "reconciled", "resumed"]);

export interface ProtectionStats {
  month: string; // YYYY-MM (UTC)
  /** Actions registered through the ledger this month. */
  actionsProtected: number;
  /** Replays served a stored outcome instead of re-running the side effect. */
  duplicatesBlocked: number;
  /** Approvals currently waiting on a human. */
  approvalsPending: number;
  /** Approvals decided this month (approved + denied). */
  approvalsDecided: number;
  /** Recovery cases that reached a recovered terminal state this month. */
  recoveries: number;
}

function monthStartUtc(): { start: number; label: string } {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const label = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, label };
}

export async function getProtectionStats(workspaceId: string): Promise<ProtectionStats> {
  const { start, label } = monthStartUtc();
  const [actions, cases] = await Promise.all([listActions(workspaceId), listCases(workspaceId)]);

  const monthActions = actions.filter((action) => action.createdAt >= start);
  // A replay against a known outcome is exactly one duplicate side effect that
  // did not happen: attempts beyond the first on completed/reconciled actions.
  const duplicatesBlocked = actions
    .filter((action) => action.updatedAt >= start && (action.state === "completed" || action.state === "reconciled"))
    .reduce((sum, action) => sum + Math.max(0, (action.attempts ?? 1) - 1), 0);

  let approvalsPending = 0;
  let approvalsDecided = 0;
  for (const action of actions) {
    const approval = actionApproval(action);
    if (!approval) continue;
    if (approval.status === "pending") approvalsPending += 1;
    else if ((approval.decidedAt ?? 0) >= start) approvalsDecided += 1;
  }

  const recoveries = cases.filter(
    (item) => TERMINAL_RECOVERED.has(item.state) && (item.resolvedAt ?? item.updatedAt) >= start,
  ).length;

  return {
    month: label,
    actionsProtected: monthActions.length,
    duplicatesBlocked,
    approvalsPending,
    approvalsDecided,
    recoveries,
  };
}

/** One-line summary for Slack / the weekly email. */
export function formatProtectionSummary(stats: ProtectionStats): string {
  return [
    `${stats.actionsProtected} actions protected`,
    `${stats.duplicatesBlocked} duplicate${stats.duplicatesBlocked === 1 ? "" : "s"} blocked`,
    `${stats.approvalsDecided} approval${stats.approvalsDecided === 1 ? "" : "s"} decided`,
    `${stats.recoveries} recover${stats.recoveries === 1 ? "y" : "ies"}`,
  ].join(" · ");
}
