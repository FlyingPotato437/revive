import { cookies } from "next/headers";
import { PageHeader, SectionHeading, SummaryStrip } from "@/components/app/ConsolePrimitives";
import { BillingControls } from "@/components/app/BillingControls";
import { getOrganizationBilling, organizationIdForWorkspace, PLAN_LIMITS } from "@/lib/billing";
import { getMonthlyUsage } from "@/lib/usage";
import { getProtectionStats } from "@/lib/protection-stats";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { listSessionsForWorkspace } from "@/lib/store";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const jar = await cookies(); const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const billing = await getOrganizationBilling(workspace.id, await organizationIdForWorkspace(workspace.id));
  const [sessions, monthly, protection] = await Promise.all([listSessionsForWorkspace(workspace.id), getMonthlyUsage(workspace.id), getProtectionStats(workspace.id).catch(() => null)]);
  const checkpoints = sessions.filter((session) => session.revive.checkpoint).length;
  const reauths = sessions.reduce((sum, session) => sum + session.revive.metrics.reconsents, 0);
  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader eyebrow="Account" title="Usage" description="Detection stays free. Resolution usage counts completed user actions, not seats." />
    <div className="mt-5"><SummaryStrip items={[
      { label: `Detector events (${monthly.month})`, value: String(monthly.deadRuns), detail: "free dead-run observations", tone: monthly.deadRuns ? "cobalt" : undefined },
      { label: "Resolved actions", value: String(monthly.resolvedActions), detail: "paid usage unit", tone: monthly.resolvedActions ? "ok" : undefined },
      { label: "Requests created", value: String(monthly.actionRequests), detail: "secure human actions" },
      { label: "Protected writes", value: String(monthly.protectedActions), detail: "exactly-once ledger" },
      { label: "Duplicates blocked", value: String(protection?.duplicatesBlocked ?? 0), detail: "stored result returned", tone: "ok" },
    ]} /></div>
    <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Plan" meta="billing" /><BillingControls plan={billing.plan} connectionLimit={PLAN_LIMITS[billing.plan].connections} /></section>
    <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Meter definitions" /><Row label="Detector events" value={monthly.deadRuns} detail="Terminal runs classified from redacted traces. Free." /><Row label="Resolved actions" value={monthly.resolvedActions} detail="Validated human responses completed during billing month." /><Row label="Interactive reauthorizations" value={reauths} detail="Recovery links that rotated credential lease." /><Row label="Recovery checkpoints" value={checkpoints} detail="Runs with persisted step-accurate checkpoint." /></section>
  </div>;
}

function Row({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="grid gap-2 border-b border-[#e1e5ea] px-5 py-4 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="text-[10.5px] font-semibold">{label}</div><p className="mt-1 text-[9.5px] text-[#687180]">{detail}</p></div><span className="font-mono text-[16px] font-semibold text-[#2e49c8]">{value}</span></div>; }
