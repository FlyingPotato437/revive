import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveExternalVaultConnection } from "@/lib/hosted";
import { allowedNangoIntegrations, fetchNangoMicrosoftIdentity, MICROSOFT_GRAPH_RECOVERY_SCOPES } from "@/lib/integrations/nango";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json() as { connectionId?: string; integrationId?: string };
    const connectionId = String(body.connectionId || "");
    const integrationId = String(body.integrationId || "");
    if (!connectionId || !allowedNangoIntegrations().includes(integrationId)) {
      return NextResponse.json({ error: "valid connectionId and allowlisted integrationId are required" }, { status: 400 });
    }
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    const identity = await fetchNangoMicrosoftIdentity({ connectionId, integrationId });
    await saveExternalVaultConnection({
      id: connectionId,
      workspaceId: workspace.id,
      provider: "microsoft",
      accountId: identity.accountId,
      scopes: [...MICROSOFT_GRAPH_RECOVERY_SCOPES],
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
    return NextResponse.json({ ok: true, connectionId, accountId: identity.accountId, tenant: identity.tenant });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "connection verification failed" }, { status: 502 });
  }
}
