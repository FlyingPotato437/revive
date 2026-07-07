import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteCustomConnector, listCustomConnectors, setCustomConnector } from "@/lib/custom-connectors";
import { builtInProviderForIntegration } from "@/lib/integrations/providers";
import { requireWorkspaceRole } from "@/lib/rbac";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "viewer");
    return NextResponse.json({ connectors: await listCustomConnectors(workspace.id) });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status });
  }
}

export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    const body = await req.json();
    const integrationId = String(body.integrationId || "").trim();
    if (builtInProviderForIntegration(integrationId)) {
      return NextResponse.json({ error: "this integration is already handled by a built-in identity adapter" }, { status: 409 });
    }
    const connector = await setCustomConnector(workspace.id, session.email, body);
    await audit({
      workspaceId: workspace.id,
      actor: session.email,
      subjectKind: "connection",
      subjectId: connector.integrationId,
      event: "custom_connector_registered",
      detail: { label: connector.label, probePath: connector.identityProbe.path, provisional: true },
    });
    return NextResponse.json({ connector }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not register connector" }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "operator");
    const body = await req.json();
    const integrationId = String(body.integrationId || "").trim();
    await deleteCustomConnector(workspace.id, integrationId);
    await audit({
      workspaceId: workspace.id,
      actor: session.email,
      subjectKind: "connection",
      subjectId: integrationId,
      event: "custom_connector_deleted",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not delete connector" }, { status });
  }
}

