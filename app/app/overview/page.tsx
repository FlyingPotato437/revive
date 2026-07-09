import Link from "next/link";
import { cookies } from "next/headers";
import {
  ago, CaseStateBadge, GuaranteeStrip, MetricMeter, PageHeader, SectionHeading, VerdictBadge,
} from "@/components/app/ConsolePrimitives";
import { ApprovalsPanel } from "@/components/app/ApprovalsPanel";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { listActions, listCases } from "@/lib/control-plane";
import { getProtectionStats } from "@/lib/protection-stats";
import { getMonthlyUsage } from "@/lib/usage";
import { getOrganizationBilling, organizationIdForWorkspace, PLAN_LIMITS } from "@/lib/billing";
import { listWorkspaceConnections } from "@/lib/hosted";

export const dynamic = "force-dynamic";

const OPEN_CASE = (state: string) => !["completed", "rejected", "expired", "escalated", "manual_review"].includes(state);

export default async function OverviewPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);

  const [stats, actions, cases, connections] = await Promise.all([
    getProtectionStats(workspace.id).catch(() => null),
    listActions(workspace.id).catch(() => []),
    listCases(workspace.id).catch(() => []),
    listWorkspaceConnections(workspace.id).catch(() => []),
  ]);
  // Billing depends on resolving the org id first; guard that resolution on its
  // own so a billing hiccup degrades to "no plan" instead of 500ing the page.
  const orgId = await organizationIdForWorkspace(workspace.id).catch(() => null);
  const billing = orgId ? await getOrganizationBilling(workspace.id, orgId).catch(() => null) : null;
  const usage = billing ? await getMonthlyUsage(workspace.id).catch(() => null) : null;

  const openCases = cases.filter((c) => OPEN_CASE(c.state)).length;
  const recentActions = [...actions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  const recentCases = [...cases].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const lastWrite = Math.max(0, ...actions.map((a) => a.updatedAt), ...cases.map((c) => c.updatedAt));
  const s = stats ?? { actionsProtected: 0, duplicatesBlocked: 0, approvalsPending: 0, approvalsDecided: 0, recoveries: 0, month: "" };
  const caseLimit = billing ? PLAN_LIMITS[billing.plan].casesPerMonth : null;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Operations"
        title="Overview"
        description={`Live protection ledger for ${workspace.name}${s.month ? ` · ${s.month}` : ""}. Every number is derived from the persisted action and recovery ledgers, not sample data.`}
        actions={<Link href="/app/quickstart" className="inline-flex h-9 items-center border border-[#151922] bg-[#151922] px-4 text-[10.5px] font-semibold text-white transition hover:bg-[#2a2f3a]">Wrap a server</Link>}
      />

      {/* 1 — four-guarantee masthead */}
      <div className="mt-5">
        <GuaranteeStrip
          items={[
            { label: "Exactly-once", value: String(s.duplicatesBlocked), detail: `${s.actionsProtected} actions protected`, href: "/app/runs", accent: "cobalt", live: s.duplicatesBlocked > 0 },
            { label: "Approvals", value: s.approvalsPending > 0 ? `${s.approvalsPending} pending` : "0", detail: `${s.approvalsDecided} decided`, href: "/app/approvals", accent: "warn", live: s.approvalsPending > 0 },
            { label: "Recovery", value: String(s.recoveries), detail: `${openCases} open`, href: "/app/runs", accent: "ok", live: s.recoveries > 0 },
            { label: "Audit", value: String(actions.length + cases.length), detail: lastWrite ? `last write ${ago(lastWrite)}` : "no writes yet", href: "/app/runs", accent: "ink", live: false },
          ]}
        />
      </div>

      {/* 2 — the daily-actionable surface */}
      <section className={`instrument-panel mt-5 overflow-hidden ${s.approvalsPending > 0 ? "border-l-[4px] border-l-[#9a5c15]" : ""}`}>
        <SectionHeading title="Waiting on you" meta={`${s.approvalsPending} pending`} />
        <ApprovalsPanel limit={5} pendingOnly />
      </section>

      {/* 3 — operational grid: action ledger (8) + recovery cases (4) */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="instrument-panel overflow-hidden lg:col-span-8">
          <SectionHeading title="Action ledger" meta={`${s.actionsProtected} this month`} action={<Link href="/app/runs" className="font-mono text-[9px] text-[#4967f2] hover:underline">View ledger →</Link>} />
          {recentActions.length ? recentActions.map((action) => (
            <Link key={action.id} href={`/app/runs/${action.runId}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[#e1e5ea] px-5 py-3 last:border-0 hover:bg-[#f5f6f2]">
              <div className="min-w-0">
                <div className="truncate font-mono text-[11px] font-semibold text-[#151922]">{action.actionKey}</div>
                <div className="mt-0.5 truncate font-mono text-[8.5px] text-[#8a929d]">run {action.runId}{action.attempts > 1 ? <span className="text-[#18724e]"> · ×{action.attempts}</span> : null}</div>
              </div>
              <VerdictBadge state={action.state} />
              <span className="font-mono text-[8.5px] text-[#8a929d]">{ago(action.updatedAt)}</span>
            </Link>
          )) : <Empty title="No protected actions yet" hint="Wrap a server or call protect_action to record the first ledger entry." />}
        </section>

        <section className="instrument-panel overflow-hidden lg:col-span-4">
          <SectionHeading title="Recovery cases" meta={`${openCases} open`} action={<Link href="/app/runs" className="font-mono text-[9px] text-[#4967f2] hover:underline">View all →</Link>} />
          {recentCases.length ? recentCases.map((c) => (
            <Link key={c.id} href={`/app/runs/${c.runId}`} className="grid gap-2 border-b border-[#e1e5ea] px-5 py-3 last:border-0 hover:bg-[#f5f6f2]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-[#151922]">{c.reason.split(":")[0].slice(0, 44) || c.id}</div>
                  <div className="mt-0.5 truncate font-mono text-[8px] text-[#8a929d]">{c.actionKey}</div>
                </div>
                <CaseStateBadge state={c.state} />
              </div>
              <span className="font-mono text-[8.5px] text-[#8a929d]">{ago(c.updatedAt)}</span>
            </Link>
          )) : <Empty title="No recovery cases" hint="A case opens automatically when an agent run fails on a dead credential." />}
        </section>
      </div>

      {/* 4 — install / health rail */}
      <section className={`instrument-panel mt-5 overflow-hidden ${actions.length === 0 ? "border-l-[4px] border-l-[#4967f2]" : ""}`}>
        <SectionHeading title="Wrap any MCP server" meta="one config line" />
        <div className="border-b border-[#e1e2de] px-5 py-4">
          <pre className="overflow-x-auto border border-[#151922] bg-[#fbfcf8] px-4 py-3 font-mono text-[10.5px] leading-5 text-[#151922]">{`"args": ["revive-mcp-gateway", "--", "npx", "-y", "@your/mcp-server"],
"env": { "REVIVE_API_KEY": "rv_live_••••" }`}</pre>
          <p className="mt-2 font-mono text-[8.5px] text-[#828b97]">Every tool call gets exactly-once, approvals, and recovery. Also available as pip / npm SDK and REST.</p>
        </div>
        <div className="grid sm:grid-cols-2">
          <div className="border-b border-[#e1e2de] px-5 py-4 sm:border-b-0 sm:border-r">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Connections</div>
              <Link href="/app/connections" className="font-mono text-[9px] text-[#4967f2] hover:underline">{connections.length ? "Manage →" : "Connect →"}</Link>
            </div>
            <div className={`mt-1.5 text-[19px] font-semibold tracking-[-.035em] ${connections.length ? "text-[#151922]" : "text-[#af4039]"}`}>{connections.length}</div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[8px] uppercase tracking-[.1em] text-[#7b8491]">Plan {billing ? `· ${billing.plan}` : ""}</div>
              <Link href="/app/usage" className="font-mono text-[9px] text-[#4967f2] hover:underline">Usage →</Link>
            </div>
            <div className="mt-2"><MetricMeter used={usage?.recoveryCases ?? 0} limit={caseLimit} /></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="px-5 py-12">
      <div className="text-[12px] font-semibold text-[#151922]">{title}</div>
      <p className="mt-2 text-[10.5px] text-[#687180]">{hint}</p>
    </div>
  );
}
