import { cookies } from "next/headers";
import { QuickstartFlow } from "@/components/app/QuickstartFlow";
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
  return <QuickstartFlow initial={{
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
    }} />;
}
