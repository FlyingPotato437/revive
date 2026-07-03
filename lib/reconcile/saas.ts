import { nangoProxy } from "@/lib/integrations/nango";
import type { GraphReconcileResult, ReconcileOutcome } from "./graph";

type ProxyCall = typeof nangoProxy;

export interface SlackMessageProbe {
  integrationId: string;
  connectionId: string;
  channel: string;
  timestamp?: string;
  clientMessageId?: string;
  oldest?: string;
}

export async function reconcileSlackMessage(
  probe: SlackMessageProbe,
  call: ProxyCall = nangoProxy,
): Promise<GraphReconcileResult> {
  if (!probe.channel || (!probe.timestamp && !probe.clientMessageId)) {
    return { outcome: "unknown", strategy: "subject_window", detail: "channel and timestamp or clientMessageId are required" };
  }
  const query = new URLSearchParams({ channel: probe.channel, limit: "100", inclusive: "true" });
  if (probe.timestamp) query.set("latest", probe.timestamp);
  if (probe.oldest) query.set("oldest", probe.oldest);
  const response = await call({
    integrationId: probe.integrationId,
    connectionId: probe.connectionId,
    path: `/api/conversations.history?${query}`,
  });
  const payload = await response.json() as {
    ok?: boolean;
    error?: string;
    messages?: { ts?: string; client_msg_id?: string }[];
  };
  if (!response.ok || payload.ok === false) {
    return { outcome: "unknown", strategy: "subject_window", detail: payload.error || `provider returned ${response.status}` };
  }
  const hit = payload.messages?.find((message) =>
    (probe.timestamp && message.ts === probe.timestamp) ||
    (probe.clientMessageId && message.client_msg_id === probe.clientMessageId));
  return hit
    ? { outcome: "committed", remoteId: hit.ts, strategy: "subject_window", detail: "Slack message found by stable message identifier" }
    : { outcome: "not_found", strategy: "subject_window", detail: "Slack message was not found in the bounded channel history" };
}

export interface JiraIssueProbe {
  integrationId: string;
  connectionId: string;
  issueKey?: string;
  projectKey?: string;
  summary?: string;
  createdAfter?: string;
}

export async function reconcileJiraIssue(
  probe: JiraIssueProbe,
  call: ProxyCall = nangoProxy,
): Promise<GraphReconcileResult> {
  if (probe.issueKey) {
    const response = await call({
      integrationId: probe.integrationId,
      connectionId: probe.connectionId,
      path: `/rest/api/3/issue/${encodeURIComponent(probe.issueKey)}?fields=id,key`,
    });
    if (response.status === 404) return { outcome: "not_found", strategy: "message_id", detail: "Jira issue key does not exist" };
    if (!response.ok) return { outcome: "unknown", strategy: "message_id", detail: `provider returned ${response.status}` };
    const issue = await response.json() as { id?: string; key?: string };
    return issue.id || issue.key
      ? { outcome: "committed", remoteId: issue.key || issue.id, strategy: "message_id", detail: "Jira issue exists" }
      : { outcome: "unknown", strategy: "message_id", detail: "Jira returned an issue without an identifier" };
  }
  if (!probe.projectKey || !probe.summary || !probe.createdAfter) {
    return { outcome: "unknown", strategy: "subject_window", detail: "issueKey or projectKey, summary, and createdAfter are required" };
  }
  const quote = (value: string) => value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const jql = `project = "${quote(probe.projectKey)}" AND summary ~ "\\\"${quote(probe.summary)}\\\"" AND created >= "${quote(probe.createdAfter)}" ORDER BY created DESC`;
  const query = new URLSearchParams({ jql, maxResults: "2", fields: "id,key,summary" });
  const response = await call({
    integrationId: probe.integrationId,
    connectionId: probe.connectionId,
    path: `/rest/api/3/search/jql?${query}`,
  });
  if (!response.ok) return { outcome: "unknown", strategy: "subject_window", detail: `provider returned ${response.status}` };
  const payload = await response.json() as { issues?: { id?: string; key?: string }[] };
  if ((payload.issues?.length || 0) > 1) return { outcome: "unknown", strategy: "subject_window", detail: "multiple Jira issues match the fallback probe" };
  const hit = payload.issues?.[0];
  return hit
    ? { outcome: "committed", remoteId: hit.key || hit.id, strategy: "subject_window", detail: "one Jira issue matched the bounded probe" }
    : { outcome: "not_found", strategy: "subject_window", detail: "no Jira issue matched the bounded probe" };
}

export interface SalesforceRecordProbe {
  integrationId: string;
  connectionId: string;
  apiVersion?: string;
  object: string;
  externalIdField: string;
  externalIdValue: string;
}

export async function reconcileSalesforceRecord(
  probe: SalesforceRecordProbe,
  call: ProxyCall = nangoProxy,
): Promise<GraphReconcileResult> {
  const identifier = /^[A-Za-z][A-Za-z0-9_]*$/;
  if (!identifier.test(probe.object) || !identifier.test(probe.externalIdField) || !probe.externalIdValue) {
    return { outcome: "unknown", strategy: "message_id", detail: "valid object, externalIdField, and externalIdValue are required" };
  }
  const version = /^v\d{2}\.\d$/.test(probe.apiVersion || "") ? probe.apiVersion : "v61.0";
  const response = await call({
    integrationId: probe.integrationId,
    connectionId: probe.connectionId,
    path: `/services/data/${version}/sobjects/${probe.object}/${probe.externalIdField}/${encodeURIComponent(probe.externalIdValue)}`,
  });
  if (response.status === 404) return { outcome: "not_found", strategy: "message_id", detail: "Salesforce external ID was not found" };
  if (!response.ok) return { outcome: "unknown", strategy: "message_id", detail: `provider returned ${response.status}` };
  const record = await response.json() as { Id?: string; id?: string };
  const remoteId = record.Id || record.id;
  return remoteId
    ? { outcome: "committed", remoteId, strategy: "message_id", detail: "Salesforce record found by external ID" }
    : { outcome: "unknown", strategy: "message_id", detail: "Salesforce returned a record without an ID" };
}

export function replayVerdict(outcome: ReconcileOutcome) {
  return outcome === "committed" ? "already_committed" : outcome === "not_found" ? "safe_to_execute" : "reconcile_first";
}
