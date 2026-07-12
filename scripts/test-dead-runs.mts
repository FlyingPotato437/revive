import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "revive-dead-runs-"));
process.env.REVIVE_STATE_DIR = stateDir;
delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.REVIVE_CLAUDE_MODEL;

const deadRuns = await import("../lib/dead-runs.ts");
const revive = await import("../lib/revive-dead-run.ts");
const intelligence = await import("../lib/resolution-intelligence.ts");
let passed = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); passed += 1; };

const oauth = await deadRuns.recordDeadRun("ws_test", {
  projectId: "project_test",
  runId: "run_books_42",
  checkpointId: "fetch_open_invoices",
  generation: 4,
  idempotencyKey: "run_books_42:terminal",
  runtime: "langgraph",
  failureMessage: "QuickBooks OAuth refresh failed: invalid_grant for owner@example.com",
  trace: "Authorization: Bearer secret-token-123 access_token=raw-secret 401 token revoked",
  inputTokens: 12_000,
  outputTokens: 3_000,
  estimatedCostUsd: 1.25,
});
ok(oauth.category === "expired_oauth", "expired OAuth classified");
ok(oauth.recoverable && oauth.suggestedActionType === "reauthorization", "OAuth maps to recoverable reconnect");
ok(!oauth.failureMessage.includes("owner@example.com") && !oauth.traceExcerpt.includes("secret-token-123") && !oauth.traceExcerpt.includes("raw-secret"), "trace and failure secrets redacted");
ok(oauth.checkpointId === "fetch_open_invoices" && oauth.generation === 4, "continuation coordinates retained");

const duplicate = await deadRuns.recordDeadRun("ws_test", {
  projectId: "project_test", runId: "run_books_42", checkpointId: "fetch_open_invoices", generation: 4,
  idempotencyKey: "run_books_42:terminal", runtime: "langgraph",
  failureMessage: "QuickBooks OAuth refresh failed: invalid_grant for another@example.com",
  trace: "a retry may contain more trace data", inputTokens: 99,
});
ok(duplicate.id === oauth.id && duplicate.inputTokens === 12_000, "duplicate detector event returns original record");
await assert.rejects(deadRuns.recordDeadRun("ws_test", {
  projectId: "project_test", runId: "run_books_42", checkpointId: "different", generation: 5,
  idempotencyKey: "run_books_42:terminal", runtime: "langgraph", failureMessage: "different failure",
}), /different dead run/);
passed += 1;

const missing = await deadRuns.recordDeadRun("ws_test", {
  projectId: "project_test", runId: "run_recruiting_9", checkpointId: "candidate_review", generation: 2,
  idempotencyKey: "run_recruiting_9:terminal", runtime: "temporal",
  failureMessage: "Required field missing; needs user input before continuing", inputTokens: 8_000, outputTokens: 1_000, estimatedCostUsd: .75,
});
ok(missing.category === "missing_input" && missing.suggestedActionType === "clarification", "missing input classified");

const onboarding = await deadRuns.recordDeadRun("ws_onboarding", {
  projectId: "project_onboarding", runId: "onboarding_run", checkpointId: "confirm_contact", generation: 1,
  idempotencyKey: "onboarding:test", runtime: "onboarding",
  failureMessage: "Missing input: a human must confirm the required billing contact email before this agent can continue.",
}, { deterministic: true });
ok(onboarding.recoverable && onboarding.category === "missing_input", "onboarding test blocker is deterministically recoverable");

const stats = await deadRuns.getDeadRunStats("ws_test", 7, "project_test");
ok(stats.totalRunsLost === 2 && stats.recoverableRuns === 2, "dead-run totals counted");
ok(stats.wastedTokens === 24_000 && stats.estimatedCostUsd === 2, "token and cost loss counted");

const result = await revive.reviveDeadRun("ws_test", oauth.id, {
  recipient: { subjectId: "qb-owner-42", email: "owner@customer.com", role: "account owner" },
  destinationUrl: "https://connect.example.com/quickbooks",
  requestedBy: "test",
});
ok(result.request.actionType === "reauthorization" && result.request.validation?.deadRunId === oauth.id, "classified blocker becomes validated action");
ok(result.request.runId === oauth.runId && result.request.checkpointId === oauth.checkpointId && result.request.generation === oauth.generation, "resolution binds exact suspended run");
ok(result.deadRun.status === "resolution_requested" && result.deadRun.actionRequestId === result.request.id, "detector links resolution request");

const clarified = await revive.reviveDeadRun("ws_test", missing.id, {
  recipient: { subjectId: "request-owner", email: "request-owner@example.com" }, requestedBy: "test",
});
ok(clarified.request.fields[0]?.label === "Information needed to continue", "fallback clarification field explains what belongs in the response");

const validation = await intelligence.validateResolution({ request: result.request, response: { completed: true } });
ok(validation.valid && validation.classifier === "schema", "safe deterministic validation works without Claude");
const recent = await intelligence.assessResumeSafety({ ...result.request, completedAt: Date.now() });
ok(recent.decision === "resume", "recent run resumes");
const stale = await intelligence.assessResumeSafety({ ...result.request, createdAt: Date.now() - 8 * 864e5, completedAt: Date.now() });
ok(stale.decision === "manual_review", "very stale run holds for review");

fs.rmSync(stateDir, { recursive: true, force: true });
console.log(`dead runs: ${passed}/17 assertions passed`);
