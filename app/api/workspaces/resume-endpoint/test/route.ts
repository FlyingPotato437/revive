import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { safeWebhookEndpoint, signWebhook, type WebhookEvent } from "@/lib/webhooks";
import { getResumeEndpoint } from "@/lib/workspace-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Session-authed console sibling of /api/v1/workspace/resume-endpoint/test.
// Delivers a signed recovery.resume_test event synchronously so an admin can
// confirm signature verification from the console before a real recovery
// depends on it. The receiver should verify + reply 2xx; it must not resume.
export async function POST(req: NextRequest) {
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let workspaceId: string;
  let config: Awaited<ReturnType<typeof getResumeEndpoint>>;
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "admin");
    workspaceId = workspace.id;
    config = await getResumeEndpoint(workspace.id);
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status });
  }
  if (!config) {
    return NextResponse.json({ error: "no resume endpoint is registered for this workspace" }, { status: 404 });
  }

  const event: WebhookEvent = {
    id: `evt_${crypto.randomUUID()}`,
    type: "recovery.resume_test",
    createdAt: new Date().toISOString(),
    data: { workspaceId },
  };
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  let status = 0;
  let error: string | undefined;
  try {
    const endpoint = safeWebhookEndpoint(config.url);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Revive-Runtime/1.0",
        "webhook-id": event.id,
        "webhook-timestamp": timestamp,
        "webhook-signature": signWebhook(config.secret, event.id, timestamp, body),
        "idempotency-key": event.id,
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    status = response.status;
    if (!response.ok) error = `endpoint returned ${response.status}`;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "delivery failed";
  }
  await audit({
    workspaceId,
    actor: session.email,
    subjectKind: "connection",
    subjectId: workspaceId,
    event: "resume_endpoint_tested",
    detail: { url: config.url, status, error },
  });
  if (error) return NextResponse.json({ ok: false, status, error }, { status: 502 });
  return NextResponse.json({ ok: true, status, eventId: event.id });
}
