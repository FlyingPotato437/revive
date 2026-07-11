import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowSquareOut, Check, Clock, GitDiff, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { PageHeader, SectionHeading, SummaryStrip, TransactionStateBadge } from "@/components/app/ConsolePrimitives";
import { TransactionApprovalButtons } from "@/components/app/TransactionApprovalButtons";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { getOutcomeTransaction } from "@/lib/outcome-transactions";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const jar = await cookies(); const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const transaction = await getOutcomeTransaction(workspace.id, id).catch(() => null); if (!transaction) notFound();
  const settled = transaction.steps.filter((step) => ["verified", "compensated", "skipped"].includes(step.state)).length;
  const unresolved = transaction.steps.filter((step) => ["unknown", "failed"].includes(step.state)).length;

  return <div className="mx-auto max-w-[1040px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <Link href="/app/transactions" className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#596273] hover:text-[#151922]"><ArrowLeft size={12} /> Transactions</Link>
    <div className="mt-4"><PageHeader eyebrow="Verified business operation" title={transaction.title} description="The operation stays open until every required provider state is verified, compensated, or assigned to a human." actions={<TransactionStateBadge state={transaction.state} />} /></div>
    <div className="mt-5"><SummaryStrip items={[{ label: "Settled steps", value: `${settled}/${transaction.steps.length}`, detail: "verified or compensated", tone: settled === transaction.steps.length ? "ok" : "cobalt" }, { label: "Unresolved", value: String(unresolved), detail: "unknown or failed", tone: unresolved ? "warn" : "ok" }, { label: "Attempts", value: String(transaction.version), detail: "transaction revisions" }]} /></div>

    {transaction.state === "awaiting_approval" && <section className="mt-5 grid gap-4 border-l-[4px] border-[#9a5c15] bg-[#fff7e8] px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><h2 className="text-[11px] font-semibold text-[#7a571c]">Approve the whole outcome</h2><p className="mt-1 text-[10.5px] leading-5 text-[#7a571c]">This approval is bound to this contract, step plan, and transaction identity.</p></div><TransactionApprovalButtons transactionId={transaction.id} /></section>}
    {transaction.state === "needs_human" && <section className="mt-5 border-l-[4px] border-[#af4039] bg-[#fff0ee] px-5 py-4"><h2 className="text-[11px] font-semibold text-[#af4039]">The final state could not be proved automatically</h2><p className="mt-1 text-[10.5px] leading-5 text-[#7a4a47]">Review the failed step below. Revive will not report this operation as complete or blindly replay its external effects.</p></section>}

    <section className="instrument-panel mt-5 overflow-hidden"><SectionHeading title="Outcome path" meta={`${transaction.steps.length} protected steps`} /><div className="divide-y divide-[#e8ebe7]">{transaction.steps.map((step, index) => {
      const tone = step.state === "verified" ? "ok" : step.state === "compensated" ? "cobalt" : ["failed", "unknown"].includes(step.state) ? "warn" : "idle";
      return <article key={step.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[28px_minmax(0,1fr)_auto] sm:items-start"><span className={`mt-0.5 flex h-7 w-7 items-center justify-center border font-mono text-[8px] ${tone === "ok" ? "border-[#cbe3d7] bg-[#edf8f2] text-[#18724e]" : tone === "cobalt" ? "border-[#d4d9fa] bg-[#edf0ff] text-[#2e49c8]" : tone === "warn" ? "border-[#ead9ba] bg-[#fff7e8] text-[#9a5c15]" : "border-[#dfe3df] bg-[#f7f8f5] text-[#7b8491]"}`}>{tone === "ok" ? <Check size={12} weight="bold" /> : tone === "warn" ? <WarningCircle size={12} /> : tone === "cobalt" ? <GitDiff size={12} /> : <Clock size={12} />}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-[11px] font-semibold text-[#151922]">{step.actionKey}</h3><span className="font-mono text-[8px] text-[#8a929d]">STEP {String(index + 1).padStart(2, "0")}</span></div><p className="mt-1 text-[10px] leading-5 text-[#687180]">{step.expectedOutcome?.label || "Provider outcome must be attached by the runtime."}</p>{step.evidence && <div className="mt-2 border-l-2 border-[#cbd4f5] pl-3 font-mono text-[8.5px] leading-4 text-[#596273]">{String(step.evidence.provider || "provider")} · {String(step.evidence.status || step.evidence.externalState || "evidence recorded")}{step.evidence.checkedAt ? ` · checked ${new Date(Number(step.evidence.checkedAt)).toLocaleString()}` : ""}</div>}{step.note && <p className="mt-2 text-[9.5px] text-[#7b8491]">{step.note}</p>}</div><div className="text-right"><TransactionStateBadge state={step.state} />{step.remoteId && <div className="mt-1 max-w-[180px] truncate font-mono text-[7.5px] text-[#9aa1aa]">{step.remoteId}</div>}</div></article>;
    })}</div></section>

    <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="instrument-panel overflow-hidden"><SectionHeading title="Transaction identity" /><dl className="divide-y divide-[#e8ebe7]">{[["Contract", transaction.contractKey], ["Run", transaction.runId], ["Idempotency key", transaction.idempotencyKey], ["Result", transaction.resultSummary || "Waiting for a settled outcome"]].map(([label, value]) => <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-5 py-3"><dt className="text-[9.5px] text-[#7b8491]">{label}</dt><dd className="break-all font-mono text-[9px] text-[#3f4753]">{value}</dd></div>)}</dl></section><aside className="instrument-panel overflow-hidden"><SectionHeading title="Decision trace" />{transaction.traceContext ? <div className="p-5"><div className="font-mono text-[9px] text-[#596273]">{transaction.traceContext.provider || "external trace"}</div><div className="mt-2 break-all font-mono text-[8px] text-[#8a929d]">{transaction.traceContext.traceId}</div>{transaction.traceContext.traceUrl && <a href={transaction.traceContext.traceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#2e49c8] hover:underline">Open reasoning trace <ArrowSquareOut size={11} /></a>}</div> : <p className="p-5 text-[10.5px] leading-5 text-[#687180]">Attach a LangSmith, Braintrust, or OpenTelemetry trace when registering the transaction. Revive keeps execution truth separate from reasoning telemetry.</p>}</aside></div>
  </div>;
}
