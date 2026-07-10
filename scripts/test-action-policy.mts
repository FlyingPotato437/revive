import assert from "node:assert/strict";
import { evaluateApproval, DEFAULT_APPROVAL_POLICY } from "../lib/workspace-config";

const policy = structuredClone(DEFAULT_APPROVAL_POLICY);

// A single Slack message is not automatically treated as a bulk operation.
assert.equal(
  evaluateApproval(policy, "slack.post_message", { operation: "outbound_message", recipientCount: 1 }).required,
  false,
);

// The typed contract catches a bulk send even when the tool name is unfamiliar.
const bulk = evaluateApproval(policy, "crm.notify_contacts", { operation: "outbound_message", recipientCount: 25 });
assert.equal(bulk.required, true);
assert.equal(bulk.source, "guardrail");

// A workspace may change the threshold without changing the integration.
policy.guardrails.bulkRecipientThreshold = 100;
assert.equal(
  evaluateApproval(policy, "crm.notify_contacts", { operation: "outbound_message", recipientCount: 99 }).required,
  false,
);
assert.equal(
  evaluateApproval(policy, "crm.notify_contacts", { operation: "outbound_message", recipientCount: 100 }).required,
  true,
);

// "Off" means off even for a monetary contract.
policy.mode = "off";
assert.equal(evaluateApproval(policy, "stripe.refund", { operation: "money_movement", monetary: true }).required, false);

console.log("action policy: 5/5 assertions passed");
