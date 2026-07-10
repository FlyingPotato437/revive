import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { CaseStateBadge, PageHeader, SectionHeading, SummaryStrip, VerdictBadge } from "@/components/app/ConsolePrimitives";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { getAction, listCases } from "@/lib/control-plane";
import { normalizeRiskContext, riskLabels } from "@/lib/action-contracts";

export const dynamic = "force-dynamic";

export default async function ActionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const [action, cases] = await Promise.all([getAction(workspace.id, id), listCases(workspace.id)]);
  if (!action) notFound();
  const relatedCases = cases.filter((item) => item.runId === action.runId && item.actionKey === action.actionKey && item.idempotencyKey === action.idempotencyKey);
  const labels = riskLabels(normalizeRiskContext(action.metadata?.riskContext));
  const requiresReconcile = action.state === "uncertain" || action.state === "started";

  return (
    <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <Link href="/app/actions" className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#596273] hover:text-[#151922]"><ArrowLeft size={12} /> Action ledger</Link>
      <div className="mt-4"><PageHeader eyebrow="Protected action" title={action.actionKey} description={requiresReconcile ? "A provider outcome is unresolved. Reconcile it before any retry." : "This record is the source of truth for retries and provider outcome."} actions={<VerdictBadge state={action.state} />} /></div>
      <div className="mt-5"><SummaryStrip items={[
        { label: "Attempts", value: String(action.attempts), detail: action.attempts > 1 ? "replay was evaluated" : "first registration" },
        { label: "Connection", value: action.connectionId, detail: "bound agent account" },
        { label: "Recovery cases", value: String(relatedCases.length), detail: relatedCases.length ? "related to this action" : "none opened", tone: relatedCases.length ? "cobalt" : undefined },
      ]} /></div>
      {requiresReconcile && <section className="mt-5 border-l-[4px] border-[#9a5c15] bg-[#fff7e8] px-5 py-4"><h2 className="text-[11px] font-semibold text-[#7a571c]">Reconcile before retrying</h2><p className="mt-1 text-[10.5px] leading-5 text-[#7a571c]">Ask the provider whether this action committed. Revive will return the stored result or safely reopen the action once the outcome is known.</p></section>}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <section className="instrument-panel overflow-hidden"><SectionHeading title="Action context" /><dl className="divide-y divide-[#e8ebe7]">{[
          ["Run", action.runId],
          ["Idempotency key", action.idempotencyKey],
          ["Remote ID", action.remoteId || "Not recorded"],
          ["Result", action.resultRef ? "Stored" : "Not stored"],
        ].map(([label, value]) => <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-4 py-3 sm:px-5"><dt className="text-[9.5px] text-[#7b8491]">{label}</dt><dd className="min-w-0 break-all font-mono text-[9px] text-[#3f4753]">{value}</dd></div>)}</dl></section>
        <section className="instrument-panel overflow-hidden"><SectionHeading title="Policy facts" />{labels.length ? <div className="flex flex-wrap gap-2 p-5">{labels.map((label) => <span key={label} className="border border-[#d4d9fa] bg-[#f0f2ff] px-2 py-1 font-mono text-[8.5px] text-[#4054b0]">{label}</span>)}</div> : <p className="p-5 text-[10.5px] leading-5 text-[#687180]">No typed action contract was provided for this call.</p>}</section>
      </div>
      {relatedCases.length > 0 && <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Related recovery" />{relatedCases.map((recovery) => <Link key={recovery.id} href={`/app/runs/${recovery.id}`} className="flex items-center justify-between gap-3 border-b border-[#e8ebe7] px-5 py-3 last:border-b-0 hover:bg-[#f7f8f5]"><span className="min-w-0 truncate text-[10.5px] font-semibold text-[#151922]">{recovery.reason}</span><span className="flex shrink-0 items-center gap-2"><CaseStateBadge state={recovery.state} /><ArrowRight size={12} className="text-[#4967f2]" /></span></Link>)}</section>}
    </div>
  );
}
