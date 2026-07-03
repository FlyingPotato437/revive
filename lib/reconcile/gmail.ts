// Gmail reconciliation adapter: same contract as the Graph adapter, proving
// the reconciliation abstraction is not Entra-shaped. All reads go through the
// Nango proxy against the Gmail API; Revive never holds the raw token.
//
// Strategies:
//   1. messageId       — direct GET users/me/messages/{id}
//   2. rfc822MessageId — exact search `rfc822msgid:<id>` (idempotency-grade)
//   3. subject + window — search `in:sent subject:"…" after:<epoch>`; presence proof

import { nangoProxy } from "@/lib/integrations/nango";
import type { GraphReconcileResult, ReconcileOutcome } from "@/lib/reconcile/graph";

export interface GmailMailProbe {
  integrationId: string;
  connectionId: string;
  messageId?: string;
  rfc822MessageId?: string;
  subject?: string;
  windowMinutes?: number;
}

export interface GmailReconcileResult {
  outcome: ReconcileOutcome;
  remoteId?: string;
  strategy: "message_id" | "rfc822_message_id" | "subject_window";
  detail: string;
}

async function searchSent(probe: GmailMailProbe, query: string): Promise<{ id: string } | null | "error"> {
  const response = await nangoProxy({
    integrationId: probe.integrationId,
    connectionId: probe.connectionId,
    path: `/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=2`,
  });
  if (!response.ok) return "error";
  const payload = await response.json() as { messages?: { id: string }[] };
  return payload.messages?.[0] ?? null;
}

export async function reconcileGmailSentMail(probe: GmailMailProbe): Promise<GmailReconcileResult> {
  if (probe.messageId) {
    const response = await nangoProxy({
      integrationId: probe.integrationId,
      connectionId: probe.connectionId,
      path: `/gmail/v1/users/me/messages/${encodeURIComponent(probe.messageId)}?format=minimal`,
    });
    if (response.ok) {
      const message = await response.json() as { id: string; labelIds?: string[] };
      const isDraft = message.labelIds?.includes("DRAFT") ?? false;
      return {
        outcome: isDraft ? "not_found" : "committed",
        remoteId: message.id,
        strategy: "message_id",
        detail: isDraft ? "message exists but is still a draft (send did not commit)" : `labels: ${(message.labelIds || []).join(",")}`,
      };
    }
    if (response.status === 404) return { outcome: "not_found", strategy: "message_id", detail: "message id does not exist at the provider" };
    return { outcome: "unknown", strategy: "message_id", detail: `provider returned ${response.status}` };
  }

  if (probe.rfc822MessageId) {
    const hit = await searchSent(probe, `in:sent rfc822msgid:${probe.rfc822MessageId}`);
    if (hit === "error") return { outcome: "unknown", strategy: "rfc822_message_id", detail: "provider search failed" };
    return hit
      ? { outcome: "committed", remoteId: hit.id, strategy: "rfc822_message_id", detail: "sent message carries this Message-ID" }
      : { outcome: "not_found", strategy: "rfc822_message_id", detail: "no sent message carries this Message-ID" };
  }

  if (probe.subject) {
    const windowMinutes = Math.max(1, Math.min(probe.windowMinutes ?? 60, 24 * 60));
    const afterEpoch = Math.floor(Date.now() / 1000) - windowMinutes * 60;
    const quoted = probe.subject.replace(/"/g, '\\"');
    const hit = await searchSent(probe, `in:sent subject:"${quoted}" after:${afterEpoch}`);
    if (hit === "error") return { outcome: "unknown", strategy: "subject_window", detail: "provider search failed" };
    return hit
      ? { outcome: "committed", remoteId: hit.id, strategy: "subject_window", detail: "sent message with this subject inside the window" }
      : { outcome: "not_found", strategy: "subject_window", detail: `no sent message with this subject in the last ${windowMinutes} minutes` };
  }

  return { outcome: "unknown", strategy: "subject_window", detail: "no probe fields supplied (messageId, rfc822MessageId, or subject)" };
}

export type { GraphReconcileResult };
