import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { AttentionQueue } from "@/components/app/AttentionQueue";
import { PageHeader } from "@/components/app/ConsolePrimitives";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { listActions, listCases } from "@/lib/control-plane";
import { listDeadJobs, listWorkspaceConnections } from "@/lib/hosted";
import { getApprovalPolicy } from "@/lib/workspace-config";
import { getResumeEndpoint } from "@/lib/workspace-secrets";
import { buildAttentionQueue, buildReadiness } from "@/lib/attention";
import { listOutcomeTransactions } from "@/lib/outcome-transactions";

export const dynamic = "force-dynamic";

export default async function AttentionPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const [actions, cases, deadJobs, connections, policy, resumeEndpoint, transactions] = await Promise.all([
    listActions(workspace.id).catch(() => []),
    listCases(workspace.id).catch(() => []),
    listDeadJobs(workspace.id).catch(() => []),
    listWorkspaceConnections(workspace.id).catch(() => []),
    getApprovalPolicy(workspace.id).catch(() => null),
    getResumeEndpoint(workspace.id).catch(() => null),
    listOutcomeTransactions(workspace.id).catch(() => []),
  ]);
  const safePolicy = policy ?? { mode: "high_risk" as const, requirePatterns: [], allowPatterns: [], guardrails: { outboundMessages: "bulk" as const, bulkRecipientThreshold: 25, monetaryActions: true, destructiveActions: true, productionChanges: true } };
  const attention = buildAttentionQueue({ actions, cases, deadJobs, transactions });
  const readiness = buildReadiness({
    activeApiKeys: workspace.apiKeys.filter((key) => !key.revokedAt && (!key.expiresAt || key.expiresAt > Date.now())).length,
    actions,
    connections,
    policy: safePolicy,
    resumeEndpointConfigured: Boolean(resumeEndpoint),
  });

  return <div className="mx-auto max-w-[980px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <Link href="/app/overview" className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#596273] hover:text-[#151922]"><ArrowLeft size={12} /> Overview</Link>
    <div className="mt-4"><PageHeader eyebrow="Operations" title="All attention" description="Every transaction exception, approval, recovery, uncertain action, and failed delivery that needs a response." /></div>
    <div className="mt-5"><AttentionQueue initialItems={attention} readiness={readiness} showAll /></div>
  </div>;
}
