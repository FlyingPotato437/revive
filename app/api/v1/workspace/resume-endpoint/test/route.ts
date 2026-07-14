import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { enqueuePendingWorkspaceContinuations, safeWebhookEndpoint, signWebhook, type WebhookEvent } from "@/lib/webhooks";
import { getResumeEndpoint, markResumeEndpointVerified } from "@/lib/workspace-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/workspace/resume-endpoint/test — deliver a signed
// recovery.resume_test event synchronously so an integrator can confirm
// signature verification before a real recovery depends on it. The receiver
// should verify the signature and reply 2xx; it must not resume anything.
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, "admin");
  if (!auth.ok) return auth.response;
  const config = await getResumeEndpoint(auth.workspace.id);
  if (!config) {
    return NextResponse.json({ error: "no resume endpoint is registered for this workspace" }, { status: 404 });
  }
  const event: WebhookEvent = {
    id: `evt_${crypto.randomUUID()}`,
    type: "recovery.resume_test",
    createdAt: new Date().toISOString(),
    data: { workspaceId: auth.workspace.id },
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
    const acknowledgement = await response.json().catch(() => ({})) as { ok?: boolean; test?: boolean };
    if (!response.ok) error = `endpoint returned ${response.status}`;
    else if (acknowledgement.ok !== true || acknowledgement.test !== true) {
      error = "endpoint did not acknowledge the signed Revive test event";
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "delivery failed";
  }
  let queued = { recoveryCases: 0, actionRequests: 0 };
  if (!error) {
    try {
      await markResumeEndpointVerified(auth.workspace.id, config.url);
      queued = await enqueuePendingWorkspaceContinuations(auth.workspace.id);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "could not activate automatic resume";
    }
  }
  await audit({
    workspaceId: auth.workspace.id,
    actor: auth.keyPrefix,
    subjectKind: "connection",
    subjectId: auth.workspace.id,
    event: "resume_endpoint_tested",
    detail: { url: config.url, status, error, queued },
  });
  if (error) return NextResponse.json({ ok: false, status, error }, { status: 502 });
  return NextResponse.json({ ok: true, verified: true, status, eventId: event.id, queued });
}
