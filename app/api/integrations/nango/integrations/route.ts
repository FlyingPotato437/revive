import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { nangoConfigured } from "@/lib/integrations/nango";
import { nangoIntegrationsForWorkspace } from "@/lib/integrations/providers";
import { requireWorkspaceRole } from "@/lib/rbac";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → the server-allowlisted integrations the console may offer, with their
// provider labels. The browser never picks integration ids on its own.
export async function GET(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "viewer");
    return NextResponse.json({ configured: nangoConfigured(), integrations: await nangoIntegrationsForWorkspace(workspace.id) });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status });
  }
}
