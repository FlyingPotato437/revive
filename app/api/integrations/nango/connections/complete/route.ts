import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveExternalVaultConnection } from "@/lib/hosted";
import { fetchNangoIdentity, nangoIntegrationAvailable, providerForIntegration } from "@/lib/integrations/providers";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { getOrganizationBilling, organizationIdForWorkspace, PLAN_LIMITS } from "@/lib/billing";
import { listWorkspaceConnections } from "@/lib/hosted";
import { requireWorkspaceRole } from "@/lib/rbac";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json() as { connectionId?: string; integrationId?: string };
    const connectionId = String(body.connectionId || "");
    const integrationId = String(body.integrationId || "");
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    if (!connectionId || !(await nangoIntegrationAvailable(workspace.id, integrationId))) {
      return NextResponse.json({ error: "valid connectionId and workspace integrationId are required" }, { status: 400 });
    }
    // Plan gate: connection count is the billed unit. Re-binding an existing
    // connection id never counts against the limit.
    const existing = await listWorkspaceConnections(workspace.id);
    if (!existing.some((item) => item.id === connectionId)) {
      const organizationId = await organizationIdForWorkspace(workspace.id);
      const billing = await getOrganizationBilling(workspace.id, organizationId);
      const limit = PLAN_LIMITS[billing.plan].connections;
      if (limit !== null && existing.length >= limit) {
        return NextResponse.json(
          { error: `the ${billing.plan} plan allows ${limit} connection${limit === 1 ? "" : "s"}; upgrade to add more`, code: "plan_limit" },
          { status: 402 },
        );
      }
    }
    const provider = await providerForIntegration(integrationId, workspace.id);
    if (!provider) {
      return NextResponse.json({ error: `no identity adapter for integration "${integrationId}"` }, { status: 400 });
    }
    const identity = await fetchNangoIdentity({ connectionId, integrationId, workspaceId: workspace.id });
    await saveExternalVaultConnection({
      id: connectionId,
      workspaceId: workspace.id,
      provider: provider.key,
      issuer: provider.issuer(identity),
      accountId: identity.accountId,
      scopes: [...provider.recoveryScopes],
      vault: "nango",
      integrationId,
      providerSubject: identity.subject,
      providerTenant: identity.tenant,
      displayName: identity.displayName,
    });
    await audit({
      workspaceId: workspace.id,
      actor: session.email,
      subjectKind: "connection",
      subjectId: connectionId,
      event: "identity_bound",
      detail: { integrationId, tenant: identity.tenant },
    });
    return NextResponse.json({ ok: true, connectionId, accountId: identity.accountId, tenant: identity.tenant, provisional: Boolean(provider.provisional) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "connection verification failed" }, { status: 502 });
  }
}
