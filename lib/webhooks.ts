import crypto from "node:crypto";
import { completeJob, enqueueJob, failJob, type QueueJob } from "./hosted";
import { hmacHex } from "./secure-envelope";
import { audit } from "./audit";
import { getCase, transition, type ControlCase } from "./control-plane";

export interface WebhookEvent {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
}

export function signWebhook(secret: string, id: string, timestamp: string, body: string): string {
  return `v1,${hmacHex(secret, `${id}.${timestamp}.${body}`)}`;
}

export function verifyWebhook(secret: string, signature: string, id: string, timestamp: string, body: string, toleranceSeconds = 300): boolean {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > toleranceSeconds) return false;
  const expected = signWebhook(secret, id, timestamp, body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function enqueueWebhookEvent(type: string, data: Record<string, unknown>): Promise<string | null> {
  if (!process.env.REVIVE_WEBHOOK_URL || !process.env.REVIVE_WEBHOOK_SECRET) return null;
  const event: WebhookEvent = { id: `evt_${crypto.randomUUID()}`, type, createdAt: new Date().toISOString(), data };
  return enqueueJob("webhook.deliver", { event, endpoint: process.env.REVIVE_WEBHOOK_URL }, { id: `wh_${event.id}`, maxAttempts: 8 });
}

export async function enqueueRuntimeResume(record: ControlCase, generation: number): Promise<string | null> {
  if (!process.env.REVIVE_RUNTIME_RESUME_URL || !process.env.REVIVE_RUNTIME_RESUME_SECRET) return null;
  return enqueueJob("runtime.resume", {
    endpoint: process.env.REVIVE_RUNTIME_RESUME_URL,
    workspaceId: record.workspaceId,
    caseId: record.id,
    runId: record.runId,
    checkpointId: record.checkpointId,
    connectionId: record.connectionId,
    actionKey: record.actionKey,
    idempotencyKey: record.idempotencyKey,
    generation,
  }, {
    id: `resume_${record.id}_v${record.version}`,
    maxAttempts: 8,
    workspaceId: record.workspaceId,
  });
}

function safeWebhookEndpoint(raw: string): URL {
  const endpoint = new URL(raw);
  const local = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) {
    throw new Error("webhook endpoints must use HTTPS");
  }
  return endpoint;
}

export async function deliverWebhookJob(job: QueueJob): Promise<void> {
  if (job.kind !== "webhook.deliver") throw new Error(`unsupported job kind ${job.kind}`);
  const secret = process.env.REVIVE_WEBHOOK_SECRET;
  if (!secret) throw new Error("REVIVE_WEBHOOK_SECRET is not configured");
  const event = job.payload.event as WebhookEvent;
  const endpoint = safeWebhookEndpoint(String(job.payload.endpoint));
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Revive-Webhooks/1.0",
      "webhook-id": event.id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signWebhook(secret, event.id, timestamp, body),
      "idempotency-key": event.id,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`webhook endpoint returned ${response.status}`);
}

type RuntimeResumeAcknowledgement = {
  ok?: boolean;
  resumed?: boolean;
  runId?: string;
  checkpointId?: string;
};

export async function deliverRuntimeResumeJob(job: QueueJob): Promise<void> {
  if (job.kind !== "runtime.resume") throw new Error(`unsupported job kind ${job.kind}`);
  const secret = process.env.REVIVE_RUNTIME_RESUME_SECRET;
  if (!secret) throw new Error("REVIVE_RUNTIME_RESUME_SECRET is not configured");
  const endpoint = safeWebhookEndpoint(String(job.payload.endpoint));
  const data = {
    caseId: String(job.payload.caseId),
    workspaceId: String(job.payload.workspaceId),
    runId: String(job.payload.runId),
    checkpointId: job.payload.checkpointId ? String(job.payload.checkpointId) : undefined,
    connectionId: String(job.payload.connectionId),
    actionKey: String(job.payload.actionKey),
    idempotencyKey: String(job.payload.idempotencyKey),
    generation: Number(job.payload.generation),
  };
  const event: WebhookEvent = {
    id: job.id,
    type: "recovery.resume_requested",
    createdAt: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Revive-Runtime/1.0",
      "webhook-id": event.id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signWebhook(secret, event.id, timestamp, body),
      "idempotency-key": event.id,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`runtime adapter returned ${response.status}`);
  const acknowledgement = await response.json().catch(() => ({})) as RuntimeResumeAcknowledgement;
  if (acknowledgement.ok !== true || acknowledgement.resumed !== true) {
    throw new Error("runtime adapter did not acknowledge a completed resume");
  }
  if (acknowledgement.runId !== data.runId) throw new Error("runtime adapter acknowledged the wrong run");
  if (data.checkpointId && acknowledgement.checkpointId !== data.checkpointId) {
    throw new Error("runtime adapter acknowledged the wrong checkpoint");
  }

  const record = await getCase(data.workspaceId, data.caseId);
  if (!record) throw new Error("recovery case no longer exists");
  if (["resumed", "reconciled", "completed"].includes(record.state)) return;
  if (record.state !== "identity_verified") throw new Error(`recovery case cannot resume from ${record.state}`);
  const resumed = await transition(record.workspaceId, record.id, {
    to: "resumed",
    expectedVersion: record.version,
    actor: "runtime-adapter",
    note: `Runtime acknowledged checkpoint ${data.checkpointId || "runtime-owned"}`,
  });
  await audit({
    workspaceId: resumed.workspaceId,
    actor: "runtime-adapter",
    subjectKind: "case",
    subjectId: resumed.id,
    event: "runtime_resume_acknowledged",
    detail: { runId: data.runId, checkpointId: data.checkpointId, generation: data.generation },
  });
}

export async function processJob(job: QueueJob): Promise<void> {
  try {
    if (job.kind === "webhook.deliver") await deliverWebhookJob(job);
    else if (job.kind === "runtime.resume") await deliverRuntimeResumeJob(job);
    else throw new Error(`unknown job kind: ${job.kind}`);
    await completeJob(job.id);
  } catch (error) {
    await failJob(job, error instanceof Error ? error.message : String(error));
  }
}
