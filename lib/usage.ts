// Real usage metering: counts come from the control-plane ledgers themselves
// (recovery cases opened, actions registered), not console sessions. The case
// quota is the billed unit — enforced at case-open time against the
// organization's plan.

import { hostedDatabaseEnabled, withWorkspaceTransaction } from "./hosted";
import { getOrganizationBilling, organizationIdForWorkspace, PLAN_LIMITS, type Plan } from "./billing";

export interface MonthlyUsage {
  month: string; // YYYY-MM (UTC)
  recoveryCases: number;
  protectedActions: number;
}

function monthStartUtc(): { start: Date; label: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, label };
}

export async function getMonthlyUsage(workspaceId: string): Promise<MonthlyUsage> {
  const { start, label } = monthStartUtc();
  if (!hostedDatabaseEnabled()) return { month: label, recoveryCases: 0, protectedActions: 0 };
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const [cases] = await sql<{ n: number }[]>`
      select count(*)::int as n from revive_recovery_cases
      where workspace_id = ${workspaceId} and opened_at >= ${start}
    `;
    const [actions] = await sql<{ n: number }[]>`
      select count(*)::int as n from revive_actions
      where workspace_id = ${workspaceId} and created_at >= ${start}
    `;
    return { month: label, recoveryCases: cases?.n ?? 0, protectedActions: actions?.n ?? 0 };
  });
}

export interface QuotaCheck {
  allowed: boolean;
  plan: Plan;
  used: number;
  limit: number | null;
}

/** Case-open quota: free/dev/team have monthly case ceilings; enterprise is
 *  unlimited. Reads the org plan + this month's real count. Fails OPEN on
 *  errors — a metering failure must never block a recovery. */
export async function checkCaseQuota(workspaceId: string): Promise<QuotaCheck> {
  // The shared demo sandbox is exempt: it exists for evaluation and absorbs
  // every visitor's playground runs, so a monthly ceiling would brick demos.
  if (workspaceId === "ws_revive_local") return { allowed: true, plan: "free", used: 0, limit: null };
  try {
    const organizationId = await organizationIdForWorkspace(workspaceId);
    const billing = await getOrganizationBilling(workspaceId, organizationId);
    const limit = PLAN_LIMITS[billing.plan].casesPerMonth;
    if (limit === null) return { allowed: true, plan: billing.plan, used: 0, limit: null };
    const usage = await getMonthlyUsage(workspaceId);
    return { allowed: usage.recoveryCases < limit, plan: billing.plan, used: usage.recoveryCases, limit };
  } catch {
    return { allowed: true, plan: "free", used: 0, limit: null };
  }
}
