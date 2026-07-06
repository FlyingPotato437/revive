import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { safeWebhookEndpoint } from "@/lib/webhooks";
import { clearResumeEndpoint, getResumeEndpoint, setResumeEndpoint } from "@/lib/workspace-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Session-authed console sibling of /api/v1/workspace/resume-endpoint (which is
// API-key authed). Same validation and write-only-secret contract; the shared
// secret is never returned on read.

const MIN_SECRET_LENGTH = 16;
const MAX_SECRET_LENGTH = 256;

export async function GET(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "viewer");
    const config = await getResumeEndpoint(workspace.id);
    return NextResponse.json(config ? { configured: true, url: config.url } : { configured: false });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status });
  }
}

export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const url = String(body.url || "").trim();
  const secret = String(body.secret || "");
  try {
    safeWebhookEndpoint(url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid endpoint URL" }, { status: 400 });
  }
  if (secret.length < MIN_SECRET_LENGTH || secret.length > MAX_SECRET_LENGTH) {
    return NextResponse.json(
      { error: `secret must be between ${MIN_SECRET_LENGTH} and ${MAX_SECRET_LENGTH} characters` },
      { status: 400 },
    );
  }
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "admin");
    try {
      await setResumeEndpoint(workspace.id, { url, secret });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "could not store the resume endpoint" },
        { status: 503 },
      );
    }
    await audit({
      workspaceId: workspace.id,
      actor: session.email,
      subjectKind: "connection",
      subjectId: workspace.id,
      event: "resume_endpoint_registered",
      detail: { url },
    });
    return NextResponse.json({ configured: true, url });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "admin");
    await clearResumeEndpoint(workspace.id);
    await audit({
      workspaceId: workspace.id,
      actor: session.email,
      subjectKind: "connection",
      subjectId: workspace.id,
      event: "resume_endpoint_cleared",
    });
    return NextResponse.json({ configured: false });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status });
  }
}
