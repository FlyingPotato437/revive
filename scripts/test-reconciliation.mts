import {
  reconcileJiraIssue,
  reconcileSalesforceRecord,
  reconcileSlackMessage,
} from "../lib/reconcile/saas";

const json = (status: number, value: unknown) => async () => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

const slack = await reconcileSlackMessage({
  integrationId: "slack", connectionId: "c", channel: "C1", clientMessageId: "stable-1",
}, json(200, { ok: true, messages: [{ ts: "171.1", client_msg_id: "stable-1" }] }));
if (slack.outcome !== "committed" || slack.remoteId !== "171.1") throw new Error("Slack reconciliation failed");

const jira = await reconcileJiraIssue({
  integrationId: "jira", connectionId: "c", issueKey: "OPS-42",
}, json(200, { id: "42", key: "OPS-42" }));
if (jira.outcome !== "committed" || jira.remoteId !== "OPS-42") throw new Error("Jira reconciliation failed");

const salesforce = await reconcileSalesforceRecord({
  integrationId: "salesforce", connectionId: "c", object: "Task", externalIdField: "Revive_Key__c", externalIdValue: "run-1",
}, json(200, { Id: "00Txx000001" }));
if (salesforce.outcome !== "committed" || salesforce.remoteId !== "00Txx000001") throw new Error("Salesforce reconciliation failed");

console.log("reconciliation fixtures: Slack, Jira, and Salesforce passed");
