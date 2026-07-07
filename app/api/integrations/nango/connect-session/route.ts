import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { createNangoConnectSession } from "@/lib/integrations/nango";
import { connectSessionDefaults, nangoIntegrationsForWorkspace } from "@/lib/integrations/providers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireWorkspaceRole } from "@/lib/rbac";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "nango:connect-session", 20, 60);
  if (limited) return limited;
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json() as { integrations?: unknown; organizationId?: unknown };
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    // Built-ins come from the server allowlist; custom ids come only from the
    // operator-managed definitions in this workspace.
    const allowlist = (await nangoIntegrationsForWorkspace(workspace.id)).map((integration) => integration.id);
    const requested = Array.isArray(body.integrations)
      ? body.integrations.filter((item): item is string => typeof item === "string" && /^[a-zA-Z0-9_-]+$/.test(item)).slice(0, 20)
      : [];
    const integrations = requested.length
      ? requested.filter((item) => allowlist.includes(item))
      : allowlist;
    if (!integrations.length) {
      return NextResponse.json({ error: "requested integrations are not in the server allowlist" }, { status: 400 });
    }
    const result = await createNangoConnectSession({
      endUser: { id: session.email, email: session.email },
      organization: typeof body.organizationId === "string" ? { id: body.organizationId } : undefined,
      allowedIntegrations: integrations,
      integrationDefaults: connectSessionDefaults(integrations),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nango request failed" }, { status: 502 });
  }
}
