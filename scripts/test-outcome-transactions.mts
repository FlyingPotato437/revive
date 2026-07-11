import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const stateDir = mkdtempSync(path.join(tmpdir(), "revive-outcomes-"));
process.env.REVIVE_STATE_DIR = stateDir;
delete process.env.DATABASE_URL;

try {
  const {
    createOutcomeContract,
    createOutcomeTransaction,
    decideTransactionApproval,
    transitionTransactionStep,
    listOutcomeTransactions,
  } = await import("../lib/outcome-transactions");

  const workspaceId = "ws_test";
  const contract = await createOutcomeContract(workspaceId, {
    key: "refund-and-cancel",
    name: "Refund and cancel",
    approvalMode: "always",
    preconditions: [{ key: "paid", label: "Payment is settled" }],
    requiredOutcomes: [
      { key: "refunded", label: "Refund is settled" },
      { key: "cancelled", label: "Subscription is cancelled" },
    ],
    compensation: [{ key: "escalate", label: "Escalate a partial outcome" }],
  });
  assert.equal(contract.version, 1);
  assert.equal(contract.requiredOutcomes.length, 2);

  let transaction = await createOutcomeTransaction(workspaceId, {
    runId: "run_1",
    contractKey: contract.key,
    idempotencyKey: "order_1842",
    steps: [
      { key: "refund", actionKey: "stripe.refund", connectionId: "stripe", expectedOutcome: { key: "settled", label: "Refund settled" } },
      { key: "cancel", actionKey: "billing.cancel", connectionId: "billing", expectedOutcome: { key: "cancelled", label: "Subscription cancelled" } },
    ],
  });
  assert.equal(transaction.state, "awaiting_approval");
  const duplicate = await createOutcomeTransaction(workspaceId, {
    runId: "different-run-is-ignored-by-business-key",
    contractKey: contract.key,
    idempotencyKey: "order_1842",
    steps: [{ key: "other", actionKey: "should.not.replace", connectionId: "other" }],
  });
  assert.equal(duplicate.id, transaction.id);
  assert.equal(duplicate.steps.length, 2);

  transaction = await decideTransactionApproval(workspaceId, transaction.id, { decision: "approve", actor: "owner@revive.test" });
  assert.equal(transaction.state, "planned");

  transaction = await transitionTransactionStep(workspaceId, transaction.id, "refund", { to: "executing", expectedVersion: 1 });
  transaction = await transitionTransactionStep(workspaceId, transaction.id, "refund", { to: "succeeded", expectedVersion: 2 });
  assert.equal(transaction.state, "verifying");
  transaction = await transitionTransactionStep(workspaceId, transaction.id, "refund", { to: "verified", expectedVersion: 3, remoteId: "re_123", evidence: { provider: "stripe", status: "settled", checkedAt: Date.now(), confirmed: true } });
  assert.equal(transaction.state, "executing");

  transaction = await transitionTransactionStep(workspaceId, transaction.id, "cancel", { to: "executing", expectedVersion: 1 });
  transaction = await transitionTransactionStep(workspaceId, transaction.id, "cancel", { to: "unknown", expectedVersion: 2, note: "timeout after provider acceptance" });
  assert.equal(transaction.state, "recovering");
  transaction = await transitionTransactionStep(workspaceId, transaction.id, "cancel", { to: "verifying", expectedVersion: 3 });
  transaction = await transitionTransactionStep(workspaceId, transaction.id, "cancel", { to: "verified", expectedVersion: 4, evidence: { provider: "billing", status: "cancelled", checkedAt: Date.now(), confirmed: true }, resultSummary: "Refund settled and subscription cancelled" });
  assert.equal(transaction.state, "verified");
  assert.equal(transaction.resultSummary, "Refund settled and subscription cancelled");

  await assert.rejects(
    () => transitionTransactionStep(workspaceId, transaction.id, "cancel", { to: "executing", expectedVersion: 5 }),
    /illegal step transition/,
  );
  assert.equal((await listOutcomeTransactions(workspaceId)).length, 1);
  console.log("outcome transactions: 12/12 assertions passed");
} finally {
  rmSync(stateDir, { recursive: true, force: true });
}
