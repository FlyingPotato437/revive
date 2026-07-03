// Microsoft Graph reconciliation adapter: answers "did this side effect
// already happen at the provider?" for uncertain actions, WITHOUT replaying
// anything. This is the input the replay verdict needs to move an action from
// reconcile_first to already_committed / safe_to_execute.
//
// Strategies (in order of reliability):
//   1. messageId: direct GET of the created object (send/draft mutations)
//   2. internetMessageId: exact-match filter over sentitems
//   3. subject + window: sentitems search fallback; can only prove presence,
//                          absence within the window is reported as not_found
// All reads go through the Nango proxy: Revive never holds the raw token.

import { nangoProxy } from "@/lib/integrations/nango";

export type ReconcileOutcome = "committed" | "not_found" | "unknown";

export interface GraphReconcileResult {
  outcome: ReconcileOutcome;
  /** Provider object id when the side effect was found. */
  remoteId?: string;
  strategy: "message_id" | "internet_message_id" | "subject_window";
  detail: string;
}

export interface GraphMailProbe {
  integrationId: string;
  connectionId: string;
  /** Graph message id, when the failed attempt got far enough to receive one. */
  messageId?: string;
  /** RFC 5322 internetMessageId set by the sender (idempotency-grade match). */
  internetMessageId?: string;
  /** Fallback probe: subject + how many minutes back to search sent items. */
  subject?: string;
  windowMinutes?: number;
}

export async function reconcileGraphSentMail(probe: GraphMailProbe): Promise<GraphReconcileResult> {
  // 1. Direct object fetch, the strongest evidence.
  if (probe.messageId) {
    const response = await nangoProxy({
      integrationId: probe.integrationId,
      connectionId: probe.connectionId,
      path: `/v1.0/me/messages/${encodeURIComponent(probe.messageId)}?$select=id,isDraft,sentDateTime`,
    });
    if (response.ok) {
      const message = await response.json() as { id: string; isDraft?: boolean; sentDateTime?: string };
      return {
        outcome: message.isDraft ? "not_found" : "committed",
        remoteId: message.id,
        strategy: "message_id",
        detail: message.isDraft ? "message exists but is still a draft (send did not commit)" : `sent at ${message.sentDateTime}`,
      };
    }
    if (response.status === 404) {
      return { outcome: "not_found", strategy: "message_id", detail: "message id does not exist at the provider" };
    }
    return { outcome: "unknown", strategy: "message_id", detail: `provider returned ${response.status}` };
  }

  // 2. internetMessageId exact match over sent items.
  if (probe.internetMessageId) {
    const filter = encodeURIComponent(`internetMessageId eq '${probe.internetMessageId.replace(/'/g, "''")}'`);
    const response = await nangoProxy({
      integrationId: probe.integrationId,
      connectionId: probe.connectionId,
      path: `/v1.0/me/mailFolders/sentitems/messages?$filter=${filter}&$select=id,sentDateTime&$top=2`,
    });
    if (!response.ok) return { outcome: "unknown", strategy: "internet_message_id", detail: `provider returned ${response.status}` };
    const payload = await response.json() as { value?: { id: string; sentDateTime?: string }[] };
    const hit = payload.value?.[0];
    return hit
      ? { outcome: "committed", remoteId: hit.id, strategy: "internet_message_id", detail: `sent at ${hit.sentDateTime}` }
      : { outcome: "not_found", strategy: "internet_message_id", detail: "no sent message carries this internetMessageId" };
  }

  // 3. Subject within a time window, which proves presence only.
  if (probe.subject) {
    const windowMinutes = Math.max(1, Math.min(probe.windowMinutes ?? 60, 24 * 60));
    const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
    const filter = encodeURIComponent(`sentDateTime ge ${since} and subject eq '${probe.subject.replace(/'/g, "''")}'`);
    const response = await nangoProxy({
      integrationId: probe.integrationId,
      connectionId: probe.connectionId,
      path: `/v1.0/me/mailFolders/sentitems/messages?$filter=${filter}&$select=id,sentDateTime,subject&$top=2`,
    });
    if (!response.ok) return { outcome: "unknown", strategy: "subject_window", detail: `provider returned ${response.status}` };
    const payload = await response.json() as { value?: { id: string; sentDateTime?: string }[] };
    const hit = payload.value?.[0];
    return hit
      ? { outcome: "committed", remoteId: hit.id, strategy: "subject_window", detail: `sent at ${hit.sentDateTime}` }
      : { outcome: "not_found", strategy: "subject_window", detail: `no sent message with this subject in the last ${windowMinutes} minutes` };
  }

  return { outcome: "unknown", strategy: "subject_window", detail: "no probe fields supplied (messageId, internetMessageId, or subject)" };
}
