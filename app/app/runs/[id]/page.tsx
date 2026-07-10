import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { hydrateSession } from "@/lib/store";
import { getCase, listActions, listActionsForRun, type ControlAction, type ControlCase } from "@/lib/control-plane";
import { PageHeader, StatusBadge, SummaryStrip } from "@/components/app/ConsolePrimitives";
import { RecoveryTrace } from "@/components/app/RecoveryTrace";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function RecoveryCaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const controlCase = await getCase(workspace.id, id);
  if (controlCase) {
    const ledger = await listActionsForRun(workspace.id, controlCase.runId);
    return <ControlPlaneCaseDetail recovery={controlCase} ledger={ledger} />;
  }
  // Hydrate from Postgres: on serverless the case may live on another instance.
  const session = await hydrateSession(id);
  if (!session) notFound();
  const run = session.revive;
  const recovery = run.recoveryCase;
  const status = recovery?.status ?? run.status;
  const tone = status === "recovered" || run.status === "completed" ? "ok" : status === "awaiting_user" ? "warn" : run.status === "dead" ? "fail" : "cobalt";
  // Hosted control-plane case: render the REAL transition history and the real
  // action ledger, never a reconstructed spine.
  const controlPlaneEvents = recovery?.events ?? [];
  const isControlPlane = controlPlaneEvents.length > 0;
  const ledger = isControlPlane && session.workspaceId
    ? (await listActions(session.workspaceId)).filter((action) => action.runId === recovery!.runId)
    : [];
  const terminalDuration = recovery?.resolvedAt && recovery.openedAt
    ? `${((recovery.resolvedAt - recovery.openedAt) / 1000).toFixed(1)}s`
    : undefined;

  return <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <div className="mb-4"><Link href="/app/runs" className="text-[10px] font-medium text-[#777b81] hover:text-[#25282d]">← All recovery cases</Link></div>
    <PageHeader eyebrow="Recovery case" title={recovery?.id ?? run.id} description={`Microsoft Entra / ${run.steps[run.currentStep]?.label ?? "Run completed"} / opened ${formatDate(recovery?.openedAt ?? session.createdAt)}`} actions={<StatusBadge tone={tone}>{status.replaceAll("_", " ")}</StatusBadge>} />

    <div className="mt-5"><SummaryStrip items={[{ label: "Run identity", value: recovery?.runId ?? run.id, detail: "same logical execution" }, { label: "Credential lease", value: `Generation ${run.token.generation}`, detail: isControlPlane ? recovery!.credentialLeaseId : run.token.leaseId, tone: run.token.generation > 1 ? "cobalt" : undefined }, { label: "Failed action", value: recovery?.failedStepId ?? "Not recorded", detail: ledger[0]?.idempotencyKey ?? run.actions[0]?.idempotencyKey ?? "no mutating action" }, { label: "Recovery time", value: run.metrics.recoveredMs ? `${(run.metrics.recoveredMs / 1000).toFixed(1)}s` : terminalDuration ?? (recovery?.resolvedAt ? "resolved" : "In progress"), detail: isControlPlane ? `${controlPlaneEvents.length} recorded transitions` : `${run.metrics.resumes} resume / ${run.metrics.deduplicatedActions} deduplicated`, tone: run.status === "completed" ? "ok" : "warn" }]} /></div>

    {isControlPlane ? (
      <section className="instrument-panel evidence-plate mt-5 overflow-hidden rounded-[8px]"><div className="flex h-12 items-center justify-between border-b border-[#e2e3df] px-5"><div><span className="text-[11px] font-semibold text-[#26292e]">Case transitions</span><span className="ml-2 font-mono text-[8.5px] text-[#96999e]">recorded by the control plane · nothing reconstructed</span></div><span className="font-mono text-[8.5px] text-[#9a9da1]">{recovery!.id}</span></div><div className="divide-y divide-[#ecece8]">{controlPlaneEvents.map((event, index) => <div key={`${event.at}-${index}`} className="grid grid-cols-[150px_1fr_auto] items-center gap-3 px-5 py-3"><span className="font-mono text-[8.5px] text-[#95989d]">{formatDate(event.at)}</span><div className="min-w-0"><span className="font-mono text-[9.5px] text-[#3e4248]">{event.from ? `${event.from} → ${event.to}` : event.to}</span>{event.note && <div className="mt-0.5 truncate text-[8.5px] text-[#8d9095]">{event.note}</div>}</div><span className="font-mono text-[8px] text-[#9a9da1]">{event.actor}</span></div>)}</div></section>
    ) : (
      <section className="instrument-panel evidence-plate mt-5 overflow-hidden rounded-[8px]"><div className="flex h-12 items-center justify-between border-b border-[#e2e3df] px-5"><div><span className="text-[11px] font-semibold text-[#26292e]">Recovery continuity spine</span><span className="ml-2 font-mono text-[8.5px] text-[#96999e]">evidence by system</span></div><span className="font-mono text-[8.5px] text-[#9a9da1]">{session.id}</span></div><RecoveryTrace run={run} /></section>
    )}

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      {isControlPlane ? (
        <section className="instrument-panel overflow-hidden rounded-[8px]"><div className="flex h-12 items-center justify-between border-b border-[#e2e3df] px-5"><h2 className="text-[11px] font-semibold text-[#26292e]">Action ledger</h2><span className="font-mono text-[8.5px] text-[#96999e]">{ledger.length} actions</span></div><div className="divide-y divide-[#ecece8]">{ledger.length ? ledger.map((action) => <div key={action.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3"><div className="min-w-0"><div className="truncate text-[10.5px] font-medium text-[#303339]">{action.actionKey}</div><div className="mt-0.5 break-all font-mono text-[8.5px] text-[#95989d]">{action.idempotencyKey}</div></div><span className="font-mono text-[8.5px] text-[#8c8f94]">×{action.attempts}</span><StatusBadge tone={action.state === "completed" || action.state === "reconciled" ? "ok" : action.state === "uncertain" ? "warn" : "neutral"}>{action.state}</StatusBadge></div>) : <div className="px-5 py-6 text-[10px] text-[#8d9095]">No actions registered for this run.</div>}</div></section>
      ) : (
        <section className="instrument-panel overflow-hidden rounded-[8px]"><div className="flex h-12 items-center justify-between border-b border-[#e2e3df] px-5"><h2 className="text-[11px] font-semibold text-[#26292e]">Execution evidence</h2><span className="font-mono text-[8.5px] text-[#96999e]">{run.steps.length} steps</span></div><div className="divide-y divide-[#ecece8]">{run.steps.map((step, index) => <div key={step.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-5 py-3"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-semibold ${step.status === "ok" ? "bg-[#edf8f2] text-[#18724e]" : step.status === "checkpointed" || step.status === "resuming" ? "bg-[#f0f2ff] text-[#465bd5]" : step.status === "failed" ? "bg-[#fff0ee] text-[#af4039]" : "border border-[#dfe0dc] text-[#999ca1]"}`}>{step.status === "ok" ? "✓" : index + 1}</span><div className="min-w-0"><div className="truncate text-[10.5px] font-medium text-[#303339]">{step.label}</div><div className="mt-0.5 truncate font-mono text-[8.5px] text-[#95989d]">{step.method} {step.path}</div></div><span className="font-mono text-[8.5px] uppercase text-[#8c8f94]">{step.status}</span></div>)}</div></section>
      )}

      <div className="space-y-5">
        <DetailSection title="Identity binding"><Detail label="Provider" value="Microsoft Entra" /><Detail label="Cause" value={recovery?.causeCode ?? session.deathCode ?? "Not recorded"} mono /><Detail label="Lease" value={isControlPlane ? recovery!.credentialLeaseId : run.token.leaseId} mono /><Detail label="Generation" value={String(run.token.generation)} mono />{!isControlPlane && <Detail label="Fingerprint" value={run.token.fingerprint} mono />}</DetailSection>
        {!isControlPlane && <DetailSection title="Checkpoint"><Detail label="Step" value={run.checkpoint?.stepId ?? "Not captured"} /><Detail label="Cursor" value={run.checkpoint ? JSON.stringify(run.checkpoint.cursor) : "Not captured"} mono /><Detail label="Raw tokens" value="Never persisted" /></DetailSection>}
        {!isControlPlane && <DetailSection title="Action ledger">{run.actions.length ? run.actions.map((action) => <div key={action.id} className="border-b border-[#ecece8] px-4 py-3 last:border-0"><div className="flex items-center justify-between"><span className="font-mono text-[8.5px] text-[#7b7f85]">{action.stepId}</span><StatusBadge tone={action.state === "committed" ? "ok" : "neutral"}>{action.state}</StatusBadge></div><div className="mt-2 break-all font-mono text-[8.5px] leading-4 text-[#92959a]">{action.idempotencyKey}</div></div>) : <div className="px-4 py-5 text-[10px] text-[#8d9095]">No mutating action prepared.</div>}</DetailSection>}
      </div>
    </div>
  </div>;
}

function ControlPlaneCaseDetail({ recovery, ledger }: { recovery: ControlCase; ledger: ControlAction[] }) {
  const terminal = ["completed", "rejected", "expired", "escalated", "manual_review"].includes(recovery.state);
  const tone = recovery.state === "completed" ? "ok" : terminal ? "fail" : "cobalt";
  const related = ledger.filter((action) => action.actionKey === recovery.actionKey && action.idempotencyKey === recovery.idempotencyKey);
  return <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <Link href="/app/runs" className="inline-flex items-center text-[10px] font-semibold text-[#596273] hover:text-[#151922]">← Recovery cases</Link>
    <div className="mt-4"><PageHeader eyebrow="Recovery case" title={recovery.actionKey} description={recovery.reason} actions={<StatusBadge tone={tone}>{recovery.state.replaceAll("_", " ")}</StatusBadge>} /></div>
    <div className="mt-5"><SummaryStrip items={[
      { label: "Run", value: recovery.runId, detail: "same logical execution" },
      { label: "Actions", value: String(related.length), detail: "affected records" },
      { label: "Transitions", value: String(recovery.events.length), detail: recovery.resolvedAt ? "case resolved" : "case in progress", tone: recovery.resolvedAt ? "ok" : "cobalt" },
    ]} /></div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <section className="instrument-panel overflow-hidden"><div className="flex min-h-12 items-center justify-between border-b border-[#e1e2de] px-4 sm:px-5"><div><h2 className="text-[12px] font-semibold text-[#25282d]">Recovery timeline</h2><p className="mt-0.5 text-[10px] text-[#687180]">Recorded transitions for this case.</p></div></div>{recovery.events.map((event, index) => <div key={`${event.at}-${index}`} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-[#e8ebe7] px-4 py-3 last:border-b-0 sm:px-5"><time className="font-mono text-[8.5px] text-[#8a929d]">{formatDate(event.at)}</time><div className="min-w-0"><div className="font-mono text-[9.5px] text-[#3f4753]">{event.from ? `${event.from} → ${event.to}` : event.to}</div>{event.note && <p className="mt-1 text-[9.5px] leading-4 text-[#687180]">{event.note}</p>}</div></div>)}</section>
      <section className="instrument-panel overflow-hidden"><div className="flex h-12 items-center border-b border-[#e1e2de] px-4"><h2 className="text-[12px] font-semibold text-[#25282d]">Recovery context</h2></div><dl className="divide-y divide-[#e8ebe7]">{[["Provider", recovery.provider || "Not recorded"], ["Connection", recovery.connectionId], ["Policy", recovery.policy.replaceAll("_", " ")], ["Checkpoint", recovery.checkpointId || "Not recorded"]].map(([label, value]) => <div key={label} className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 px-4 py-3"><dt className="text-[9.5px] text-[#7b8491]">{label}</dt><dd className="min-w-0 break-all font-mono text-[9px] text-[#3f4753]">{value}</dd></div>)}</dl></section>
    </div>
    <section className="instrument-panel mt-5 overflow-hidden"><div className="flex min-h-12 items-center justify-between border-b border-[#e1e2de] px-4 sm:px-5"><div><h2 className="text-[12px] font-semibold text-[#25282d]">Affected actions</h2><p className="mt-0.5 text-[10px] text-[#687180]">Review replay state before any retry.</p></div></div>{related.length ? related.map((action) => <Link key={action.id} href={`/app/actions/${action.id}`} className="flex items-center justify-between gap-3 border-b border-[#e8ebe7] px-4 py-3 last:border-b-0 hover:bg-[#f7f8f5] sm:px-5"><span className="min-w-0 truncate text-[10.5px] font-semibold text-[#151922]">{action.actionKey}</span><StatusBadge tone={action.state === "completed" || action.state === "reconciled" ? "ok" : action.state === "uncertain" ? "warn" : "cobalt"}>{action.state}</StatusBadge></Link>) : <p className="px-5 py-6 text-[10.5px] text-[#687180]">No action record is linked to this recovery case.</p>}</section>
  </div>;
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="instrument-panel overflow-hidden rounded-[8px]"><div className="flex h-11 items-center border-b border-[#e2e3df] px-4"><h2 className="text-[10.5px] font-semibold text-[#303339]">{title}</h2></div>{children}</section>; }
function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="grid grid-cols-[88px_1fr] gap-3 border-b border-[#ecece8] px-4 py-2.5 last:border-0"><span className="text-[9px] text-[#909398]">{label}</span><span className={`min-w-0 break-all text-right text-[9.5px] text-[#3e4248] ${mono ? "font-mono" : ""}`}>{value}</span></div>; }
function formatDate(value: number) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value); }
