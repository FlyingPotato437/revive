import crypto from "node:crypto";
import { completeJob, enqueueJob, failJob, type QueueJob } from "./hosted";
import { hmacHex } from "./secure-envelope";

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

export async function processJob(job: QueueJob): Promise<void> {
  try {
    if (job.kind === "webhook.deliver") await deliverWebhookJob(job);
    else throw new Error(`unknown job kind: ${job.kind}`);
    await completeJob(job.id);
  } catch (error) {
    await failJob(job, error instanceof Error ? error.message : String(error));
  }
}
