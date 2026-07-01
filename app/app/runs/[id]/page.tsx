import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/store";
import { PageHeader, StatusBadge, SummaryStrip } from "@/components/app/ConsolePrimitives";
import { RecoveryTrace } from "@/components/app/RecoveryTrace";

export const dynamic = "force-dynamic";

export default async function RecoveryCaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) notFound();
  const run = session.revive;
  const recovery = run.recoveryCase;
  const status = recovery?.status ?? run.status;
  const tone = status === "recovered" || run.status === "completed" ? "ok" : status === "awaiting_user" ? "warn" : run.status === "dead" ? "fail" : "cobalt";

  return <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <div className="mb-4"><Link href="/app/runs" className="text-[10px] font-medium text-[#777b81] hover:text-[#25282d]">← All recovery cases</Link></div>
    <PageHeader eyebrow="Recovery case" title={recovery?.id ?? run.id} description={`Microsoft Entra / ${run.steps[run.currentStep]?.label ?? "Run completed"} / opened ${formatDate(recovery?.openedAt ?? session.createdAt)}`} actions={<StatusBadge tone={tone}>{status.replaceAll("_", " ")}</StatusBadge>} />

    <div className="mt-5"><SummaryStrip items={[{ label: "Run identity", value: run.id, detail: "same logical execution" }, { label: "Credential lease", value: `Generation ${run.token.generation}`, detail: run.token.leaseId, tone: run.token.generation > 1 ? "cobalt" : undefined }, { label: "Failed action", value: recovery?.failedStepId ?? "Not recorded", detail: run.actions[0]?.idempotencyKey ?? "no mutating action" }, { label: "Recovery time", value: run.metrics.recoveredMs ? `${(run.metrics.recoveredMs / 1000).toFixed(1)}s` : "In progress", detail: `${run.metrics.resumes} resume / ${run.metrics.deduplicatedActions} deduplicated`, tone: run.status === "completed" ? "ok" : "warn" }]} /></div>

    <section className="instrument-panel evidence-plate mt-5 overflow-hidden rounded-[8px]"><div className="flex h-12 items-center justify-between border-b border-[#e2e3df] px-5"><div><span className="text-[11px] font-semibold text-[#26292e]">Recovery continuity spine</span><span className="ml-2 font-mono text-[8.5px] text-[#96999e]">evidence by system</span></div><span className="font-mono text-[8.5px] text-[#9a9da1]">{session.id}</span></div><RecoveryTrace run={run} /></section>

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <section className="instrument-panel overflow-hidden rounded-[8px]"><div className="flex h-12 items-center justify-between border-b border-[#e2e3df] px-5"><h2 className="text-[11px] font-semibold text-[#26292e]">Execution evidence</h2><span className="font-mono text-[8.5px] text-[#96999e]">{run.steps.length} steps</span></div><div className="divide-y divide-[#ecece8]">{run.steps.map((step, index) => <div key={step.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-5 py-3"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-semibold ${step.status === "ok" ? "bg-[#edf8f2] text-[#18724e]" : step.status === "checkpointed" || step.status === "resuming" ? "bg-[#f0f2ff] text-[#465bd5]" : step.status === "failed" ? "bg-[#fff0ee] text-[#af4039]" : "border border-[#dfe0dc] text-[#999ca1]"}`}>{step.status === "ok" ? "✓" : index + 1}</span><div className="min-w-0"><div className="truncate text-[10.5px] font-medium text-[#303339]">{step.label}</div><div className="mt-0.5 truncate font-mono text-[8.5px] text-[#95989d]">{step.method} {step.path}</div></div><span className="font-mono text-[8.5px] uppercase text-[#8c8f94]">{step.status}</span></div>)}</div></section>

      <div className="space-y-5">
        <DetailSection title="Identity binding"><Detail label="Provider" value="Microsoft Entra" /><Detail label="Cause" value={recovery?.causeCode ?? session.deathCode ?? "Not recorded"} mono /><Detail label="Lease" value={run.token.leaseId} mono /><Detail label="Generation" value={String(run.token.generation)} mono /><Detail label="Fingerprint" value={run.token.fingerprint} mono /></DetailSection>
        <DetailSection title="Checkpoint"><Detail label="Step" value={run.checkpoint?.stepId ?? "Not captured"} /><Detail label="Cursor" value={run.checkpoint ? JSON.stringify(run.checkpoint.cursor) : "Not captured"} mono /><Detail label="Raw tokens" value="Never persisted" /></DetailSection>
        <DetailSection title="Action ledger">{run.actions.length ? run.actions.map((action) => <div key={action.id} className="border-b border-[#ecece8] px-4 py-3 last:border-0"><div className="flex items-center justify-between"><span className="font-mono text-[8.5px] text-[#7b7f85]">{action.stepId}</span><StatusBadge tone={action.state === "committed" ? "ok" : "neutral"}>{action.state}</StatusBadge></div><div className="mt-2 break-all font-mono text-[8.5px] leading-4 text-[#92959a]">{action.idempotencyKey}</div></div>) : <div className="px-4 py-5 text-[10px] text-[#8d9095]">No mutating action prepared.</div>}</DetailSection>
      </div>
    </div>
  </div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="instrument-panel overflow-hidden rounded-[8px]"><div className="flex h-11 items-center border-b border-[#e2e3df] px-4"><h2 className="text-[10.5px] font-semibold text-[#303339]">{title}</h2></div>{children}</section>; }
function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="grid grid-cols-[88px_1fr] gap-3 border-b border-[#ecece8] px-4 py-2.5 last:border-0"><span className="text-[9px] text-[#909398]">{label}</span><span className={`min-w-0 break-all text-right text-[9.5px] text-[#3e4248] ${mono ? "font-mono" : ""}`}>{value}</span></div>; }
function formatDate(value: number) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value); }
