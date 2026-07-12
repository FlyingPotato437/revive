import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ActionRequestStateBadge, ago, CaseStateBadge, PageHeader, StatusBadge, SummaryStrip, TransactionStateBadge, VerdictBadge } from "@/components/app/ConsolePrimitives";
import { AttentionQueue } from "@/components/app/AttentionQueue";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { listActions, listCases } from "@/lib/control-plane";
import { listDeadJobs } from "@/lib/hosted";
import { buildAttentionQueue } from "@/lib/attention";
import { listOutcomeTransactions } from "@/lib/outcome-transactions";
import { listUserActionRequests } from "@/lib/action-requests";
import { getDeadRunStats, listDeadRuns } from "@/lib/dead-runs";

export const dynamic = "force-dynamic";

const TERMINAL_CASES = new Set(["completed", "rejected", "expired", "escalated", "manual_review"]);

export default async function OverviewPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const [actions, cases, deadJobs, transactions, actionRequests, deadRunStats, deadRuns] = await Promise.all([
    listActions(workspace.id).catch(() => []),
    listCases(workspace.id).catch(() => []),
    listDeadJobs(workspace.id).catch(() => []),
    listOutcomeTransactions(workspace.id).catch(() => []),
    listUserActionRequests(workspace.id).catch(() => []),
    getDeadRunStats(workspace.id, 7).catch(() => ({ days: 7, totalRunsLost: 0, recoverableRuns: 0, recoverableRate: 0, wastedTokens: 0, estimatedCostUsd: 0, resolvedRuns: 0, categories: [] })),
    listDeadRuns(workspace.id).catch(() => []),
  ]);

  const attention = buildAttentionQueue({ actions, cases, deadJobs, transactions, actionRequests, deadRuns });
  const openCases = cases.filter((item) => !TERMINAL_CASES.has(item.state)).length;
  const completedRequests = actionRequests.filter((item) => item.status === "completed").length;
  const waitingRequests = actionRequests.filter((item) => item.status === "pending").length;
  const resumedRequests = actionRequests.filter((item) => item.resumeStatus === "acknowledged").length;
  const activity = [
    ...deadRuns.map((run) => ({
      id: `dead-run:${run.id}`,
      kind: "dead_run" as const,
      title: run.runId,
      detail: run.category,
      href: "/app/detector",
      at: run.updatedAt,
    })),
    ...actionRequests.map((request) => ({
      id: `request:${request.id}`,
      kind: "request" as const,
      title: request.title,
      detail: request.status,
      href: `/app/requests/${request.id}`,
      at: request.updatedAt,
    })),
    ...transactions.map((transaction) => ({
      id: `transaction:${transaction.id}`,
      kind: "transaction" as const,
      title: transaction.title,
      detail: transaction.state,
      href: `/app/transactions/${transaction.id}`,
      at: transaction.updatedAt,
    })),
    ...actions.map((action) => ({
      id: `action:${action.id}`,
      kind: "action" as const,
      title: action.actionKey,
      detail: action.state,
      href: `/app/actions/${action.id}`,
      at: action.updatedAt,
    })),
    ...cases.map((recovery) => ({
      id: `case:${recovery.id}`,
      kind: "case" as const,
      title: recovery.actionKey,
      detail: recovery.state,
      href: `/app/runs/${recovery.id}`,
      at: recovery.updatedAt,
    })),
  ].sort((a, b) => b.at - a.at).slice(0, 5);

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Operations"
        title="Keep blocked agents moving"
        description="Start with the work that needs a person. Everything else stays out of the way."
        actions={<Link href={deadRunStats.totalRunsLost ? "/app/detector" : "/app/quickstart"} className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2a2f3a] active:translate-y-px">{deadRunStats.totalRunsLost ? "Review dead runs" : "Install detector"} <ArrowRight size={12} /></Link>}
      />

      <div className="mt-5">
        <SummaryStrip items={[
          { label: "Needs attention", value: String(attention.length), detail: attention.length ? "decisions and retries" : "all clear", tone: attention.length ? "warn" : "ok" },
          { label: "Waiting on people", value: String(waitingRequests), detail: waitingRequests ? "secure requests still open" : "nobody is blocking a run", tone: waitingRequests ? "warn" : "ok" },
          { label: "Runs resumed", value: String(resumedRequests), detail: `${completedRequests} responses validated`, tone: resumedRequests ? "ok" : undefined },
        ]} />
      </div>

      <div className="mt-5">
        <AttentionQueue initialItems={attention} />
      </div>

      <section className="instrument-panel mt-5 overflow-hidden" aria-labelledby="activity-title">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#e1e2de] px-4 sm:px-5">
          <div><h2 id="activity-title" className="text-[12px] font-semibold text-[#25282d]">Recent activity</h2><p className="mt-0.5 text-[10px] text-[#687180]">Latest user requests, continuations, transactions, and recoveries.</p></div>
          <Link href="/app/requests" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#2e49c8] hover:underline">View requests <ArrowRight size={11} /></Link>
        </div>
        {activity.length ? activity.map((item) => (
          <Link key={item.id} href={item.href} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-[#e8ebe7] px-4 py-3.5 last:border-b-0 hover:bg-[#f7f8f5] sm:px-5">
            <div className="min-w-0"><span className="truncate text-[11px] font-semibold text-[#151922]">{item.title}</span><span className="ml-2 hidden font-mono text-[8.5px] text-[#8a929d] sm:inline">{item.kind}</span></div>
            {item.kind === "request" ? <ActionRequestStateBadge state={item.detail} /> : item.kind === "dead_run" ? <StatusBadge tone="warn">{item.detail.replaceAll("_", " ")}</StatusBadge> : item.kind === "action" ? <VerdictBadge state={item.detail} /> : item.kind === "transaction" ? <TransactionStateBadge state={item.detail} /> : <CaseStateBadge state={item.detail} />}
            <span className="font-mono text-[8.5px] text-[#8a929d]">{ago(item.at)}</span>
          </Link>
        )) : <div className="px-5 py-8 text-[11px] text-[#687180]">No agent has asked a person for help yet. Create one secure action request and complete it end to end.</div>}
      </section>

      {openCases > 0 && <p className="mt-4 text-[10px] text-[#687180]">{openCases} recovery case{openCases === 1 ? "" : "s"} remain open. <Link href="/app/runs" className="font-semibold text-[#2e49c8] hover:underline">Review recoveries</Link></p>}
    </div>
  );
}
