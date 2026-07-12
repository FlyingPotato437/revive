import { cookies } from "next/headers";
import { QuickstartFlow } from "@/components/app/QuickstartFlow";
import { PageHeader } from "@/components/app/ConsolePrimitives";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getUserActionRequest, listUserActionRequests } from "@/lib/action-requests";
import { listDeadRuns } from "@/lib/dead-runs";
import { notificationChannels } from "@/lib/notify";
import { workspaceRole } from "@/lib/rbac";
import { getResumeEndpoint } from "@/lib/workspace-secrets";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export default async function QuickstartPage() {
  const jar = await cookies();
  const auth = verifySession(jar.get(SESSION_COOKIE)?.value)!;
  const workspace = await selectedWorkspace(auth.email, jar.get(WORKSPACE_COOKIE)?.value);
  const [runs, requests, endpoint, role] = await Promise.all([
    listDeadRuns(workspace.id).catch(() => []),
    listUserActionRequests(workspace.id).catch(() => []),
    getResumeEndpoint(workspace.id).catch(() => null),
    workspaceRole(auth.email, workspace),
  ]);
  const now = Date.now();
  const activeKey = workspace.apiKeys.some((key) => !key.revokedAt && (!key.expiresAt || key.expiresAt > now) && key.role !== "viewer");
  const latestRequest = requests[0]
    ? await getUserActionRequest(workspace.id, requests[0].id, role === "owner" || role === "admin" || role === "operator").catch(() => requests[0])
    : undefined;
  const availableRun = runs.find((run) => run.recoverable && run.status === "detected");
  const channels = notificationChannels();
  return <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-7 sm:px-6 lg:px-8">
    <PageHeader
      eyebrow="Guided setup"
      title="Complete one recovery before touching production"
      description="Revive created the workspace and project. Connect a runtime, create a safe test blocker, and send yourself the exact request a customer would receive."
    />
    <div className="mt-5"><QuickstartFlow initial={{
      email: auth.email,
      workspaceName: workspace.name,
      project: workspace.projects[0] || { id: "", name: "Recovery sandbox" },
      canAdmin: role === "owner" || role === "admin",
      canOperate: role !== "viewer",
      hasActiveKey: activeKey,
      hasDeadRun: runs.length > 0,
      hasRuntimeRun: runs.some((run) => run.runtime !== "onboarding"),
      availableDeadRunId: availableRun?.id,
      latestRequest: latestRequest ? { id: latestRequest.id, status: latestRequest.status, resumeStatus: latestRequest.resumeStatus, url: latestRequest.url } : undefined,
      endpointConfigured: Boolean(endpoint),
      channels,
    }} /></div>
    <details className="group mt-5 border border-[#e2e3df] bg-[#f7f8f5] text-[#596273]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3">
        <span className="text-[10.5px] font-semibold text-[#151922]">Runtime adapters</span>
        <span className="font-mono text-[9px] text-[#8a929d] transition group-open:rotate-45">+</span>
      </summary>
      <div className="grid gap-4 border-t border-[#e2e3df] px-5 py-4 text-[10px] leading-5 sm:grid-cols-2">
        <RuntimeLink name="LangGraph" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/langgraph.py" body="Uses the runtime interrupt and its checkpointer." />
        <RuntimeLink name="Temporal" href="https://github.com/FlyingPotato437/revive/tree/main/sidecar/revive/adapters/temporal.py" body="Signals the existing workflow with the lease generation." />
      </div>
    </details>
  </div>;
}

function RuntimeLink({ name, href, body }: { name: string; href: string; body: string }) { return <a href={href} className="group border-l-[3px] border-[#bfc5cc] pl-3 transition hover:border-[#4967f2]"><span className="text-[10px] font-semibold group-hover:text-[#2e49c8]">{name}</span><span className="mt-0.5 block text-[9.5px] text-[#687180]">{body}</span></a>; }
