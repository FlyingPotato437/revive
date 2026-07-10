import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ago, CaseStateBadge, PageHeader, SummaryStrip, VerdictBadge } from "@/components/app/ConsolePrimitives";
import { AttentionQueue } from "@/components/app/AttentionQueue";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { listActions, listCases } from "@/lib/control-plane";
import { getProtectionStats } from "@/lib/protection-stats";
import { listDeadJobs, listWorkspaceConnections } from "@/lib/hosted";
import { getApprovalPolicy } from "@/lib/workspace-config";
import { getResumeEndpoint } from "@/lib/workspace-secrets";
import { buildAttentionQueue, buildReadiness } from "@/lib/attention";

export const dynamic = "force-dynamic";

const TERMINAL_CASES = new Set(["completed", "rejected", "expired", "escalated", "manual_review"]);

export default async function OverviewPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const [stats, actions, cases, connections, policy, resumeEndpoint, deadJobs] = await Promise.all([
    getProtectionStats(workspace.id).catch(() => null),
    listActions(workspace.id).catch(() => []),
    listCases(workspace.id).catch(() => []),
    listWorkspaceConnections(workspace.id).catch(() => []),
    getApprovalPolicy(workspace.id).catch(() => null),
    getResumeEndpoint(workspace.id).catch(() => null),
    listDeadJobs(workspace.id).catch(() => []),
  ]);

  const safePolicy = policy ?? { mode: "high_risk" as const, requirePatterns: [], allowPatterns: [], guardrails: { outboundMessages: "bulk" as const, bulkRecipientThreshold: 25, monetaryActions: true, destructiveActions: true, productionChanges: true } };
  const attention = buildAttentionQueue({ actions, cases, deadJobs });
  const readiness = buildReadiness({
    activeApiKeys: workspace.apiKeys.filter((key) => !key.revokedAt && (!key.expiresAt || key.expiresAt > Date.now())).length,
    actions,
    connections,
    policy: safePolicy,
    resumeEndpointConfigured: Boolean(resumeEndpoint),
  });
  const s = stats ?? { actionsProtected: 0, duplicatesBlocked: 0, approvalsPending: 0, approvalsDecided: 0, recoveries: 0, month: "" };
  const openCases = cases.filter((item) => !TERMINAL_CASES.has(item.state)).length;
  const activity = [
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
  ].sort((a, b) => b.at - a.at).slice(0, 6);

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Operations"
        title="Agent operations"
        description="See what needs a human, what ran, and whether the workspace is ready."
        actions={<Link href="/app/quickstart" className="inline-flex h-9 items-center gap-2 border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2a2f3a] active:translate-y-px">Protect an action <ArrowRight size={12} /></Link>}
      />

      <div className="mt-5">
        <SummaryStrip items={[
          { label: "Protected this month", value: String(s.actionsProtected), detail: "recorded actions", tone: s.actionsProtected ? "cobalt" : undefined },
          { label: "Needs attention", value: String(attention.length), detail: attention.length ? "human work or retry" : "nothing open", tone: attention.length ? "warn" : "ok" },
          { label: "Duplicates avoided", value: String(s.duplicatesBlocked), detail: "stored outcome returned", tone: s.duplicatesBlocked ? "ok" : undefined },
        ]} />
      </div>

      <div className="mt-5">
        <AttentionQueue initialItems={attention} readiness={readiness} />
      </div>

      <section className="instrument-panel mt-5 overflow-hidden" aria-labelledby="activity-title">
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[#e1e2de] px-4 sm:px-5">
          <div><h2 id="activity-title" className="text-[12px] font-semibold text-[#25282d]">Recent activity</h2><p className="mt-0.5 text-[10px] text-[#687180]">Latest ledger and recovery changes.</p></div>
          <Link href="/app/actions" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#2e49c8] hover:underline">View ledger <ArrowRight size={11} /></Link>
        </div>
        {activity.length ? activity.map((item) => (
          <Link key={item.id} href={item.href} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-[#e8ebe7] px-4 py-3.5 last:border-b-0 hover:bg-[#f7f8f5] sm:px-5">
            <div className="min-w-0"><span className="truncate text-[11px] font-semibold text-[#151922]">{item.title}</span><span className="ml-2 hidden font-mono text-[8.5px] text-[#8a929d] sm:inline">{item.kind === "action" ? "action" : "recovery"}</span></div>
            {item.kind === "action" ? <VerdictBadge state={item.detail} /> : <CaseStateBadge state={item.detail} />}
            <span className="font-mono text-[8.5px] text-[#8a929d]">{ago(item.at)}</span>
          </Link>
        )) : <div className="px-5 py-8 text-[11px] text-[#687180]">No actions have reached the ledger yet. Protect one action to begin the operational record.</div>}
      </section>

      {openCases > 0 && <p className="mt-4 text-[10px] text-[#687180]">{openCases} recovery case{openCases === 1 ? "" : "s"} remain open. <Link href="/app/runs" className="font-semibold text-[#2e49c8] hover:underline">Review recoveries</Link></p>}
    </div>
  );
}
