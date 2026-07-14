import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type GoldenResult = {
  kind: "revive-golden-run";
  recordedAt: string;
  mode: "interactive" | "automatic";
  runId: string;
  checkpointId: string;
  generation: number;
  assertions: Record<string, boolean>;
  evidence: {
    deadRunId: string;
    actionRequestId: string;
    protectedActionId: string;
    transactionId: string;
    remoteId: string;
    resumeDeliveries: number;
    runtimeExecutions: number;
    providerWrites: number;
    rejectedResumeDeliveries: number;
  };
  timeline: Array<{ at: string; phase: string; detail: string }>;
  stateDirectory: string;
};

const automatic = process.argv.includes("--auto") || process.env.CI === "true";
const keepState = process.argv.includes("--keep") || !automatic;
const requestedPort = Number(process.env.REVIVE_GOLDEN_PORT || 0);
const stateDirectory = process.env.REVIVE_GOLDEN_STATE_DIR
  ? path.resolve(process.env.REVIVE_GOLDEN_STATE_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), "revive-golden-"));

process.env.REVIVE_STATE_DIR = stateDirectory;
process.env.NODE_ENV = "development";
delete process.env.DATABASE_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.REVIVE_CLAUDE_MODEL;

const workspaceId = "ws_golden_local";
const projectId = "project_golden_local";
const runId = `run_golden_${Date.now()}`;
const checkpointId = "approve-refund";
const generation = 7;
const connectionId = "conn_golden_payments";
const resumeSecret = crypto.randomBytes(32).toString("base64url");
const timeline: GoldenResult["timeline"] = [];
const providerWrites = new Map<string, { id: string; amount: number; status: string }>();
let providerWriteAttempts = 0;
let runtimeExecutions = 0;
let resumeDeliveries = 0;
let rejectedResumeDeliveries = 0;
let finished = false;
let finishResolve!: (result: GoldenResult) => void;
let finishReject!: (error: Error) => void;
const finishPromise = new Promise<GoldenResult>((resolve, reject) => {
  finishResolve = resolve;
  finishReject = reject;
});

function event(phase: string, detail: string): void {
  timeline.push({ at: new Date().toISOString(), phase, detail });
  const label = phase.padEnd(13);
  console.log(`  ${label} ${detail}`);
}

function html(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
  });
  response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Revive golden run</title><style>
  :root{font-family:ui-sans-serif,system-ui;background:#f3f2ed;color:#171914}body{max-width:680px;margin:0 auto;padding:7vh 22px}main{background:#fff;border:1px solid #d9d9d2;padding:34px;box-shadow:0 18px 60px rgba(30,30,20,.08)}small{font:600 11px ui-monospace;letter-spacing:.09em;color:#5661d8;text-transform:uppercase}h1{font-size:31px;letter-spacing:-.04em;margin:12px 0}p{line-height:1.6;color:#5e6259}dl{display:grid;grid-template-columns:120px 1fr;gap:10px;border-top:1px solid #e7e6df;border-bottom:1px solid #e7e6df;padding:18px 0;margin:24px 0}dt{color:#8a8e84}dd{margin:0;font:12px ui-monospace}button{width:100%;border:0;background:#171914;color:white;padding:14px;font-weight:700;cursor:pointer}button:hover{background:#5661d8}.ok{color:#167253}</style></head><body><main>${body}</main></body></html>`);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}

let actionToken = "";
let actionRequestId = "";
let deadRunId = "";
let protectedActionId = "";
let transactionId = "";
let remoteId = "";
let handleApproval!: () => Promise<void>;
let handleResume!: (request: IncomingMessage, response: ServerResponse, body: string) => Promise<void>;

const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  request.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    void (async () => {
      try {
        if (request.url === "/runtime/resume" && request.method === "POST") {
          await handleResume(request, response, body);
          return;
        }
        if (request.url === `/actions/${encodeURIComponent(actionToken)}` && request.method === "GET") {
          html(response, 200, `<small>Human action required</small><h1>Approve a $125 refund?</h1><p>The agent is parked at <strong>${checkpointId}</strong>. Approval is bound to the intended finance operator and this exact run generation.</p><dl><dt>Run</dt><dd>${runId}</dd><dt>Checkpoint</dt><dd>${checkpointId}</dd><dt>Generation</dt><dd>${generation}</dd></dl><form method="post"><button type="submit">Approve and resume the run</button></form>`);
          return;
        }
        if (request.url === `/actions/${encodeURIComponent(actionToken)}` && request.method === "POST") {
          await handleApproval();
          html(response, 200, "<small class=\"ok\">Recovery completed</small><h1>The same run finished safely.</h1><p>Revive resumed the parked checkpoint, reconciled the provider write after a simulated lost response, prevented a duplicate refund, and verified the outcome.</p>");
          return;
        }
        if (request.url === "/health") {
          json(response, 200, { ok: true, finished });
          return;
        }
        html(response, 404, "<h1>Not found</h1>");
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        if (!response.headersSent) json(response, 500, { ok: false, error: failure.message });
        finishReject(failure);
      }
    })();
  });
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(requestedPort, "127.0.0.1", () => resolve());
});
const address = server.address();
assert(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;
process.env.REVIVE_PUBLIC_URL = baseUrl;
process.env.REVIVE_RUNTIME_RESUME_URL = `${baseUrl}/runtime/resume`;
process.env.REVIVE_RUNTIME_RESUME_SECRET = resumeSecret;

const {
  completeUserActionRequest,
  getUserActionRequest,
  markUserActionResume,
  markUserActionResumeAssessment,
} = await import("../lib/action-requests.ts");
const { markDeadRunResolved, recordDeadRun } = await import("../lib/dead-runs.ts");
const { reviveDeadRun } = await import("../lib/revive-dead-run.ts");
const { deliverUserActionResumeJob, verifyWebhook } = await import("../lib/webhooks.ts");
const { registerAction, startAction, reconcileAction } = await import("../lib/control-plane.ts");
const { createOutcomeTransaction, transitionTransactionStep } = await import("../lib/outcome-transactions.ts");

async function resumeParkedRun(): Promise<void> {
  runtimeExecutions += 1;
  event("resume", `worker B loaded ${runId} at checkpoint ${checkpointId}`);

  let transaction = await createOutcomeTransaction(workspaceId, {
    projectId,
    runId,
    contractKey: "refund-settled",
    idempotencyKey: `${runId}:refund-settled`,
    title: "Refund the duplicate subscription charge",
    traceContext: { provider: "golden-run", traceId: runId },
    steps: [{
      key: "issue-refund",
      actionKey: "payments.refund",
      connectionId,
      expectedOutcome: { key: "refund-posted", label: "Provider reports one posted refund", provider: "golden-payments", expectedState: "posted" },
    }],
  });
  transactionId = transaction.id;
  let step = transaction.steps[0];
  transaction = await transitionTransactionStep(workspaceId, transaction.id, step.key, { to: "executing", expectedVersion: step.version });

  const idempotencyKey = `${runId}:refund:invoice-4242`;
  let action = await registerAction(workspaceId, {
    projectId,
    runId,
    checkpointId,
    connectionId,
    actionKey: "payments.refund",
    idempotencyKey,
    metadata: { riskContext: { operation: "money_movement", monetary: true }, amountBand: "under_500" },
  });
  protectedActionId = action.id;
  await startAction(workspaceId, action.id, projectId);

  remoteId = `refund_${crypto.randomBytes(6).toString("hex")}`;
  providerWriteAttempts += 1;
  providerWrites.set(idempotencyKey, { id: remoteId, amount: 125, status: "posted" });
  event("provider", `${remoteId} committed, then the response was intentionally lost`);

  // A replacement worker sees the started ledger entry as uncertain. It must
  // reconcile with the provider before it is allowed to execute the write.
  action = await registerAction(workspaceId, {
    projectId,
    runId,
    checkpointId,
    connectionId,
    actionKey: "payments.refund",
    idempotencyKey,
  });
  assert.equal(action.state, "uncertain", "a replay after a lost response must be uncertain");
  const providerRecord = providerWrites.get(idempotencyKey);
  assert(providerRecord, "provider reconciliation must find the committed refund");
  action = await reconcileAction(workspaceId, action.id, {
    remoteId: providerRecord.id,
    note: "golden-run: provider confirmed the original refund committed",
  }, projectId);
  event("reconcile", `${action.id} linked to ${providerRecord.id}; replay suppressed`);

  step = transaction.steps[0];
  transaction = await transitionTransactionStep(workspaceId, transaction.id, step.key, {
    to: "succeeded", expectedVersion: step.version, actionId: action.id, remoteId,
  });
  step = transaction.steps[0];
  transaction = await transitionTransactionStep(workspaceId, transaction.id, step.key, {
    to: "verifying", expectedVersion: step.version,
  });
  step = transaction.steps[0];
  transaction = await transitionTransactionStep(workspaceId, transaction.id, step.key, {
    to: "verified",
    expectedVersion: step.version,
    evidence: { provider: "golden-payments", status: providerRecord.status, checkedAt: Date.now(), remoteId },
    resultSummary: "One $125 refund posted; no duplicate write executed.",
  });
  assert.equal(transaction.state, "verified");
  event("verify", `${transaction.id} settled as verified`);
}

const acknowledgedEvents = new Map<string, Record<string, unknown>>();
handleResume = async (request, response, body) => {
  const webhookId = String(request.headers["webhook-id"] || "");
  const timestamp = String(request.headers["webhook-timestamp"] || "");
  const signature = String(request.headers["webhook-signature"] || "");
  if (!verifyWebhook(resumeSecret, signature, webhookId, timestamp, body)) {
    rejectedResumeDeliveries += 1;
    json(response, 401, { ok: false, error: "invalid signature" });
    return;
  }
  resumeDeliveries += 1;
  const cached = acknowledgedEvents.get(webhookId);
  if (cached) {
    json(response, 200, cached);
    return;
  }
  const eventPayload = JSON.parse(body) as { type?: string; data?: Record<string, unknown> };
  assert.equal(eventPayload.type, "action_request.completed");
  const data = eventPayload.data || {};
  assert.equal(data.runId, runId);
  assert.equal(data.checkpointId, checkpointId);
  assert.equal(data.generation, generation);
  await resumeParkedRun();
  const acknowledgement = { ok: true, resumed: true, runId, checkpointId, generation };
  acknowledgedEvents.set(webhookId, acknowledgement);
  json(response, 200, acknowledgement);
};

async function deliverContinuation(): Promise<void> {
  let request = await getUserActionRequest(workspaceId, actionRequestId);
  assert(request?.response?.decision === "approve");
  await markUserActionResumeAssessment(workspaceId, actionRequestId, {
    decision: "resume",
    reason: "Golden run approval completed immediately; checkpoint is current.",
    classifier: "deterministic",
  });
  await markDeadRunResolved(workspaceId, actionRequestId);
  request = await getUserActionRequest(workspaceId, actionRequestId);
  assert(request);
  const job = {
    id: `action_resume_${actionRequestId}_g${generation}`,
    kind: "runtime.action_resume",
    attempts: 1,
    maxAttempts: 8,
    payload: {
      endpoint: `${baseUrl}/runtime/resume`,
      workspaceId,
      actionRequestId,
      runId,
      checkpointId,
      actionType: request.actionType,
      generation,
      response: request.response || {},
      completedBy: request.completedBy || {},
      resumeDecision: "resume",
      resumeReason: "Golden run approval completed immediately; checkpoint is current.",
    },
  };
  await markUserActionResume(workspaceId, actionRequestId, "queued", job.id);
  await deliverUserActionResumeJob(job);
  // Redelivery with the same event ID must return the cached acknowledgement
  // without executing the runtime or provider mutation again.
  await deliverUserActionResumeJob(job);
}

async function completeApproval(): Promise<void> {
  if (finished) return;
  await assert.rejects(
    completeUserActionRequest(actionToken, { generation: generation - 1, response: { decision: "approve" } }),
    /stale run generation/,
  );
  event("fence", `stale human response for generation ${generation - 1} rejected`);
  const tampered = await fetch(`${baseUrl}/runtime/resume`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": "tampered_golden_event",
      "webhook-timestamp": Math.floor(Date.now() / 1000).toString(),
      "webhook-signature": "v1,invalid",
    },
    body: JSON.stringify({ type: "action_request.completed", data: { runId, checkpointId, generation } }),
  });
  assert.equal(tampered.status, 401);
  event("signature", "tampered continuation rejected before runtime execution");
  const completed = await completeUserActionRequest(actionToken, {
    generation,
    response: { decision: "approve" },
  });
  assert.equal(completed.completedBy?.subjectId, "finance-operator");
  event("human", "identity-bound approval recorded");
  await deliverContinuation();

  const request = await getUserActionRequest(workspaceId, actionRequestId);
  const assertions = {
    blockerDetected: Boolean(deadRunId),
    humanActionCompleted: request?.status === "completed",
    signedResumeAcknowledged: request?.resumeStatus === "acknowledged",
    exactRunResumed: runtimeExecutions === 1,
    duplicateDeliveryDeduplicated: resumeDeliveries === 2 && runtimeExecutions === 1,
    staleGenerationRejected: true,
    tamperedCallbackRejected: rejectedResumeDeliveries === 1,
    sideEffectReconciled: Boolean(remoteId),
    exactlyOneProviderWrite: providerWrites.size === 1 && providerWriteAttempts === 1,
    outcomeVerified: Boolean(transactionId),
  };
  for (const [name, passed] of Object.entries(assertions)) assert.equal(passed, true, name);

  const result: GoldenResult = {
    kind: "revive-golden-run",
    recordedAt: new Date().toISOString(),
    mode: automatic ? "automatic" : "interactive",
    runId,
    checkpointId,
    generation,
    assertions,
    evidence: {
      deadRunId,
      actionRequestId,
      protectedActionId,
      transactionId,
      remoteId,
      resumeDeliveries,
      runtimeExecutions,
      providerWrites: providerWriteAttempts,
      rejectedResumeDeliveries,
    },
    timeline,
    stateDirectory: keepState ? stateDirectory : "removed after automatic verification",
  };
  fs.mkdirSync(path.join(process.cwd(), "benchmarks", "results"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "benchmarks", "results", "golden-run-local.json"), `${JSON.stringify(result, null, 2)}\n`);
  finished = true;
  finishResolve(result);
}
handleApproval = completeApproval;

console.log("\nREVIVE GOLDEN RUN");
console.log("────────────────────────────────────────────────────────────────");
event("start", `agent opened ${runId}`);
event("step", "loaded invoice invoice-4242 and prepared a $125 refund");
const deadRun = await recordDeadRun(workspaceId, {
  projectId,
  runId,
  checkpointId,
  generation,
  idempotencyKey: `${runId}:approval-blocker`,
  runtime: "golden-runtime",
  failureMessage: "Approval required: finance must approve the customer refund before the agent can continue.",
  trace: { step: checkpointId, invoiceId: "invoice-4242", authorization: "Bearer golden-secret-that-must-be-redacted" },
  inputTokens: 2_400,
  outputTokens: 320,
  estimatedCostUsd: 0.03,
}, { deterministic: true });
deadRunId = deadRun.id;
assert.equal(deadRun.category, "approval_needed");
event("detect", `${deadRun.id} classified ${deadRun.category}; run parked`);

const resolution = await reviveDeadRun(workspaceId, deadRun.id, {
  recipient: { subjectId: "finance-operator", email: "finance@example.com", role: "authorized approver" },
  title: "Approve the $125 customer refund",
  description: "The agent is parked. Approve this refund to resume the exact checkpoint.",
  requestedBy: "golden-run",
});
actionRequestId = resolution.request.id;
assert(resolution.request.url);
actionToken = decodeURIComponent(resolution.request.url.split("/actions/")[1]);
event("request", `${actionRequestId} bound to finance-operator`);

if (automatic) {
  await completeApproval();
} else {
  console.log("\nOpen this secure action URL to continue:\n");
  console.log(`  ${resolution.request.url}\n`);
  console.log("The command will remain active until you approve the action.\n");
}

const timeout = setTimeout(() => finishReject(new Error("golden run timed out waiting for approval")), Number(process.env.REVIVE_GOLDEN_TIMEOUT_MS || 10 * 60_000));
try {
  const result = await finishPromise;
  clearTimeout(timeout);
  console.log("────────────────────────────────────────────────────────────────");
  console.log(`  PASS          ${Object.keys(result.assertions).length}/${Object.keys(result.assertions).length} invariants`);
  console.log(`  OUTCOME       verified · ${result.evidence.remoteId}`);
  console.log(`  DUPLICATES    ${result.evidence.resumeDeliveries} deliveries · ${result.evidence.runtimeExecutions} runtime execution · ${result.evidence.providerWrites} provider write`);
  console.log(`  REPORT        benchmarks/results/golden-run-local.json\n`);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!keepState) fs.rmSync(stateDirectory, { recursive: true, force: true });
}
