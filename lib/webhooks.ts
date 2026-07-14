import crypto from "node:crypto";
import { completeJob, enqueueJob, failJob, loadConnectionBinding, type QueueJob } from "./hosted";
import { hmacHex } from "./secure-envelope";
import { audit } from "./audit";
import { getCase, transition, type ControlCase } from "./control-plane";
import { getResumeEndpoint } from "./workspace-secrets";
import { getUserActionRequest, markUserActionResume, markUserActionResumeAssessment, type UserActionRequest } from "./action-requests";
import { assessResumeSafety } from "./resolution-intelligence";
import { markDeadRunResolved } from "./dead-runs";
import { autoReconcileRun } from "./auto-reconcile";
import { emitSpan } from "./telemetry";

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

// Workspace-registered endpoint wins; the platform-level env pair remains as a
// fallback for single-tenant deployments.
async function resolveRuntimeResumeConfig(workspaceId: string): Promise<{ url: string; secret: string; source: "workspace" | "env" } | null> {
  try {
    const scoped = await getResumeEndpoint(workspaceId);
    if (scoped) return { ...scoped, source: "workspace" };
  } catch {
    // fall through to the platform default
  }
  if (process.env.REVIVE_RUNTIME_RESUME_URL && process.env.REVIVE_RUNTIME_RESUME_SECRET) {
    return { url: process.env.REVIVE_RUNTIME_RESUME_URL, secret: process.env.REVIVE_RUNTIME_RESUME_SECRET, source: "env" };
  }
  return null;
}

export async function enqueueRuntimeResume(record: ControlCase, generation: number): Promise<string | null> {
  const config = await resolveRuntimeResumeConfig(record.workspaceId);
  if (!config) return null;
  return enqueueJob("runtime.resume", {
    endpoint: config.url,
    secretSource: config.source,
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

/** Queue a signed continuation event after a recipient completes a user action.
 * The original response stays in Revive; the runtime receives the structured
 * value plus the exact run/checkpoint/generation coordinates it must resume. */
export async function enqueueUserActionResume(record: UserActionRequest): Promise<string | null> {
  const config = await resolveRuntimeResumeConfig(record.workspaceId);
  if (!config) return null;
  return enqueueJob("runtime.action_resume", {
    endpoint: config.url,
    secretSource: config.source,
    workspaceId: record.workspaceId,
    actionRequestId: record.id,
    runId: record.runId,
    checkpointId: record.checkpointId,
    actionType: record.actionType,
    generation: record.generation,
    response: record.response || {},
    completedBy: record.completedBy || {},
    resumeDecision: record.resumeAssessment?.decision || "resume",
    resumeReason: record.resumeAssessment?.reason || "",
  }, {
    id: `action_resume_${record.id}_g${record.generation}`,
    maxAttempts: 8,
    workspaceId: record.workspaceId,
  });
}

export function safeWebhookEndpoint(raw: string): URL {
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
  generation?: number;
};

export async function deliverRuntimeResumeJob(job: QueueJob): Promise<void> {
  if (job.kind !== "runtime.resume") throw new Error(`unsupported job kind ${job.kind}`);
  // Resolve the secret at delivery time so a rotation between enqueue and
  // delivery signs with the current secret, never a stale copy in the payload.
  const config = await resolveRuntimeResumeConfig(String(job.payload.workspaceId));
  const secret = config?.secret;
  if (!secret) throw new Error("no runtime resume endpoint is configured for this workspace");
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
  if (acknowledgement.generation !== data.generation) {
    throw new Error("runtime adapter acknowledged the wrong generation");
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

export async function deliverUserActionResumeJob(job: QueueJob): Promise<void> {
  if (job.kind !== "runtime.action_resume") throw new Error(`unsupported job kind ${job.kind}`);
  const workspaceId = String(job.payload.workspaceId);
  const config = await resolveRuntimeResumeConfig(workspaceId);
  if (!config?.secret) throw new Error("no runtime resume endpoint is configured for this workspace");
  const endpoint = safeWebhookEndpoint(String(job.payload.endpoint));
  const data = {
    actionRequestId: String(job.payload.actionRequestId),
    workspaceId,
    runId: String(job.payload.runId),
    checkpointId: job.payload.checkpointId ? String(job.payload.checkpointId) : undefined,
    actionType: String(job.payload.actionType),
    generation: Number(job.payload.generation),
    response: job.payload.response || {},
    completedBy: job.payload.completedBy || {},
    resumeDecision: String(job.payload.resumeDecision || "resume"),
    resumeReason: String(job.payload.resumeReason || ""),
  };
  const event: WebhookEvent = { id: job.id, type: "action_request.completed", createdAt: new Date().toISOString(), data };
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
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
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`runtime adapter returned ${response.status}`);
  const acknowledgement = await response.json().catch(() => ({})) as RuntimeResumeAcknowledgement;
  if (acknowledgement.ok !== true || acknowledgement.resumed !== true) throw new Error("runtime adapter did not acknowledge a completed resume");
  if (acknowledgement.runId !== data.runId) throw new Error("runtime adapter acknowledged the wrong run");
  if (data.checkpointId && acknowledgement.checkpointId !== data.checkpointId) throw new Error("runtime adapter acknowledged the wrong checkpoint");
  if (acknowledgement.generation !== data.generation) throw new Error("runtime adapter acknowledged the wrong generation");
  await markUserActionResume(workspaceId, data.actionRequestId, "acknowledged", job.id);
  await audit({
    workspaceId, actor: "runtime-adapter", subjectKind: "action_request", subjectId: data.actionRequestId,
    event: "resume_acknowledged", detail: { runId: data.runId, checkpointId: data.checkpointId, generation: data.generation },
  });
  void emitSpan("revive.resume.acknowledged", {
    "revive.workspace_id": workspaceId,
    "revive.run_id": data.runId,
    "revive.request_id": data.actionRequestId,
    "revive.checkpoint_id": data.checkpointId,
    "revive.generation": data.generation,
    "revive.delivery_id": job.id,
  }, { traceSeed: `${workspaceId}:${data.runId}` });
}

/** Expand the action-completion outbox event into a signed continuation job.
 * Safe to call inline for low latency and again from the worker after a crash. */
export async function processCompletedUserAction(workspaceId: string, actionRequestId: string): Promise<UserActionRequest> {
  let request = await getUserActionRequest(workspaceId, actionRequestId);
  if (!request) throw new Error("completed action request no longer exists");
  if (request.status !== "completed") return request;
  if (request.validation?.deadRunId) await markDeadRunResolved(workspaceId, request.id);
  if (!request.resumeAssessment) {
    const assessment = await assessResumeSafety(request);
    await markUserActionResumeAssessment(workspaceId, request.id, assessment);
    request = await getUserActionRequest(workspaceId, request.id) || { ...request, resumeAssessment: assessment };
  }
  if (request.resumeAssessment?.decision === "manual_review") {
    await markUserActionResume(workspaceId, request.id, "held_for_review");
    return await getUserActionRequest(workspaceId, request.id) || { ...request, resumeStatus: "held_for_review" };
  }
  if (request.resumeStatus === "acknowledged") return request;
  const jobId = await enqueueUserActionResume(request);
  await markUserActionResume(workspaceId, request.id, jobId ? "queued" : "not_configured", jobId || undefined);
  return await getUserActionRequest(workspaceId, request.id) || request;
}

/** Expand an atomic identity-verification outbox event. Reconciliation always
 * precedes callback enqueue, including when the original HTTP request crashed. */
export async function processVerifiedRecovery(workspaceId: string, caseId: string): Promise<void> {
  const record = await getCase(workspaceId, caseId);
  if (!record) throw new Error("verified recovery case no longer exists");
  if (["resumed", "reconciled", "completed"].includes(record.state)) return;
  if (record.state !== "identity_verified") throw new Error(`recovery case cannot continue from ${record.state}`);
  const binding = await loadConnectionBinding(record.connectionId, workspaceId);
  await autoReconcileRun({
    workspaceId,
    projectId: record.projectId,
    runId: record.runId,
    connectionId: record.connectionId,
    integrationId: binding?.integrationId || "microsoft-tenant-specific",
    actor: "transactional-outbox",
  });
  const jobId = await enqueueRuntimeResume(record, record.leaseGeneration ?? 1);
  if (!jobId) throw new Error("no runtime resume endpoint is configured for this workspace");
}

export async function processJob(job: QueueJob): Promise<void> {
  try {
    if (job.kind === "webhook.deliver") await deliverWebhookJob(job);
    else if (job.kind === "runtime.resume") await deliverRuntimeResumeJob(job);
    else if (job.kind === "runtime.action_resume") await deliverUserActionResumeJob(job);
    else if (job.kind === "outbox.action_request_completed") {
      await processCompletedUserAction(String(job.payload.workspaceId), String(job.payload.actionRequestId));
    }
    else if (job.kind === "outbox.recovery_identity_verified") {
      await processVerifiedRecovery(String(job.payload.workspaceId), String(job.payload.caseId));
    }
    else throw new Error(`unknown job kind: ${job.kind}`);
    await completeJob(job.id);
  } catch (error) {
    await failJob(job, error instanceof Error ? error.message : String(error));
  }
}
