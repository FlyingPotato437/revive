import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ago, PageHeader, SummaryStrip, VerdictBadge } from "@/components/app/ConsolePrimitives";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { listActions } from "@/lib/control-plane";
import { normalizeRiskContext, riskLabels } from "@/lib/action-contracts";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const actions = await listActions(workspace.id).catch(() => []);
  const uncertain = actions.filter((action) => action.state === "uncertain" || action.state === "started").length;
  const duplicates = actions.reduce((count, action) => count + Math.max(0, action.attempts - 1), 0);

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Operations" title="Action ledger" description="The durable record of external actions agents asked Revive to protect." actions={<Link href="/app/quickstart" className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2a2f3a]">Add protection <ArrowRight size={12} /></Link>} />
      <div className="mt-5"><SummaryStrip items={[
        { label: "Recorded", value: String(actions.length), detail: "all time" },
        { label: "Needs reconcile", value: String(uncertain), detail: "outcome not yet proven", tone: uncertain ? "warn" : "ok" },
        { label: "Replays avoided", value: String(duplicates), detail: "additional attempts", tone: duplicates ? "ok" : undefined },
      ]} /></div>
      <section className="instrument-panel mt-5 overflow-hidden" aria-labelledby="ledger-list-title">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#e1e2de] px-4 sm:px-5"><div><h2 id="ledger-list-title" className="text-[12px] font-semibold text-[#25282d]">Latest actions</h2><p className="mt-0.5 text-[10px] text-[#687180]">Open a record to see its replay decision and recovery context.</p></div><span className="font-mono text-[8.5px] text-[#7b8491]">{actions.length} records</span></div>
        {actions.length ? actions.map((action) => {
          const labels = riskLabels(normalizeRiskContext(action.metadata?.riskContext));
          return <Link key={action.id} href={`/app/actions/${action.id}`} className="grid gap-2 border-b border-[#e8ebe7] px-4 py-3.5 last:border-b-0 hover:bg-[#f7f8f5] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4 sm:px-5">
            <div className="min-w-0"><div className="truncate text-[11px] font-semibold text-[#151922]">{action.actionKey}</div><div className="mt-1 flex flex-wrap gap-1.5">{labels.slice(0, 2).map((label) => <span key={label} className="border border-[#d4d9fa] bg-[#f0f2ff] px-1.5 py-0.5 font-mono text-[7.5px] text-[#4054b0]">{label}</span>)}</div></div>
            <VerdictBadge state={action.state} />
            <span className="font-mono text-[8.5px] text-[#8a929d]">{ago(action.updatedAt)}</span>
          </Link>;
        }) : <div className="px-5 py-10 text-[11px] text-[#687180]">No protected actions yet. Add the MCP gateway or SDK to create the first record.</div>}
      </section>
    </div>
  );
}
