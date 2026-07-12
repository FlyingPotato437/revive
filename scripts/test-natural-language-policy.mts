import assert from "node:assert/strict";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.REVIVE_CLAUDE_MODEL;

const {
  compileApprovalPolicyDeterministically,
  describePolicyChanges,
} = await import("../lib/natural-language-policy.ts");
const { redactSensitiveText } = await import("../lib/redaction.ts");
const { DEFAULT_APPROVAL_POLICY } = await import("../lib/workspace-config.ts");

const baseline = structuredClone(DEFAULT_APPROVAL_POLICY);
const bulk = compileApprovalPolicyDeterministically("Require approval for outbound messages to more than 20 recipients", baseline);
assert.equal(bulk.policy.guardrails.outboundMessages, "bulk");
assert.equal(bulk.policy.guardrails.bulkRecipientThreshold, 21);
assert.match(bulk.summary, /21\+ recipients/);

const writes = compileApprovalPolicyDeterministically("Make every write wait for approval", baseline);
assert.equal(writes.policy.mode, "all_mutations");

const disabled = compileApprovalPolicyDeterministically("Turn all approvals off for this workspace", baseline);
assert.equal(disabled.policy.mode, "off");

const amount = compileApprovalPolicyDeterministically("Require finance approval for refunds above $500", baseline);
assert.equal(amount.policy.guardrails.monetaryActions, true);
assert.ok(amount.assumptions.some((note: string) => note.includes("does not receive money amounts")));
assert.ok(amount.assumptions.some((note: string) => note.includes("Approver routing")));

assert.deepEqual(describePolicyChanges(baseline, baseline), ["No enforceable change was detected; the current policy is preserved."]);

const redacted = redactSensitiveText("Email admin@example.com with api_key=sk-ant-exampleexample and https://hooks.slack.com/services/T1/B2/secret");
assert.doesNotMatch(redacted, /admin@example\.com/);
assert.doesNotMatch(redacted, /sk-ant-exampleexample/);
assert.doesNotMatch(redacted, /hooks\.slack\.com/);
assert.match(redacted, /email-redacted/);
assert.match(redacted, /redacted/);

console.log("natural-language policy: 15/15 assertions passed");
