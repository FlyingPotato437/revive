# Supported Revive integration (alpha)

This is the path Revive mechanically tests and supports today:

- Node.js 20 or newer;
- `revive-sdk` 0.2.x;
- the hosted control plane at `https://revivelabs.app/api`;
- a runtime that already persists a stable run ID, checkpoint ID, and generation;
- one public HTTPS callback that uses the SDK's raw-body signature verifier; and
- idempotent checkpoint resume plus a durable callback-receipt store.

Revive does not create a durable checkpoint for your agent. LangGraph,
Temporal, or your application must be able to load and continue the supplied
checkpoint after the original process is gone.

## 1. Install the package

```bash
npm install revive-sdk@^0.2.0
```

Create an operator API key in **Workspace → API keys** and keep it server-side:

```dotenv
REVIVE_API_KEY=rv_live_...
REVIVE_RESUME_SECRET=generate-at-least-32-random-bytes
```

## 2. Report the failure boundary

Use identifiers from the durable runtime, not IDs generated only for Revive:

```ts
import { ReviveClient, createLangGraphInterruptHandler } from "revive-sdk";

export const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY,
});

export const reportBlockedRun = createLangGraphInterruptHandler(revive);

await reportBlockedRun({
  runId: config.configurable.thread_id,
  checkpointId: state.checkpointId,
  generation: state.generation,
  failureMessage: error.message,
  trace: redactTrace(state.trace),
  idempotencyKey: `${config.configurable.thread_id}:${state.checkpointId}:blocked`,
});
```

Temporal and MCP integrations use `createTemporalFailureSignal` and
`createMcpElicitationHandler` with the same coordinates.

## 3. Receive both continuation events

Revive sends `recovery.resume_requested` after credential recovery and
`action_request.completed` after an approval or structured human response.
The same handler must support both.

```ts
import express from "express";
import { createResumeWebhookHandler, type ResumeReceiptStore } from "revive-sdk";
import { checkpointRuntime, receiptDatabase } from "./runtime.js";

const receipts: ResumeReceiptStore = {
  async get(webhookId) {
    return receiptDatabase.get(webhookId);
  },
  async put(webhookId, acknowledgement) {
    await receiptDatabase.insertIfAbsent(webhookId, acknowledgement);
  },
};

const receiveRevive = createResumeWebhookHandler({
  secret: process.env.REVIVE_RESUME_SECRET!,
  receipts,
  async resume(data, context) {
    // This operation must itself be idempotent for run/checkpoint/generation.
    await checkpointRuntime.resume({
      runId: String(data.runId),
      checkpointId: data.checkpointId ? String(data.checkpointId) : undefined,
      generation: Number(data.generation),
      input: context.eventType === "action_request.completed" ? data.response : {
        connectionId: data.connectionId,
      },
    });
  },
});

const app = express();
app.post("/hooks/revive", express.raw({ type: "application/json" }), async (req, res) => {
  const result = await receiveRevive({ headers: req.headers, rawBody: req.body });
  res.status(result.status).json(result.body);
});
app.listen(process.env.PORT || 3000);
```

Do not put `express.json()` in front of this route. Revive signs the exact raw
bytes. `MemoryResumeReceiptStore` is provided for tests only; use a database
with a unique webhook-ID key in production.

## 4. Register and verify the callback

```bash
curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint \
  -H "Authorization: Bearer $REVIVE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://agents.example.com/hooks/revive\",\"secret\":\"$REVIVE_RESUME_SECRET\"}"

curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint/test \
  -H "Authorization: Bearer $REVIVE_API_KEY"
```

The first call stores a write-only secret but does not enable callbacks. The
second sends a signed `recovery.resume_test`; automatic continuation becomes
active only if the receiver returns `{ "ok": true, "test": true }`. Waiting
continuations are queued after verification.

## 5. Protect external writes

Resuming a checkpoint and safely repeating an external mutation are separate
problems. Wrap every non-idempotent provider write and reconcile an ambiguous
result before retrying:

```ts
const result = await revive.protectAction({
  runId,
  checkpointId: "issue-refund",
  connectionId: "payments-primary",
  actionKey: "payments.refund",
  idempotencyKey: refundIdempotencyKey,
  credential: loadCredentialLease,
  execute: issueRefund,
  reconcile: findRefundByIdempotencyKey,
});
```

## Acceptance checklist

Setup is ready for alpha traffic only when all of these are true:

1. A clean project can import the installed package.
2. A real runtime failure appears with the expected run/checkpoint/generation.
3. The resume endpoint is marked **Verified**, not merely **Registered**.
4. Replaying the same signed event invokes the runtime once.
5. A bad signature and a stale timestamp return HTTP 401.
6. The runtime can resume after the original worker process is killed.
7. A provider write that loses its response reconciles without a duplicate.

This repository tests the package archive with `npm run test:sdk-package` and
the full local continuation/reconciliation path with `npm run test:golden`.

## Current limits

- Microsoft is the only hosted credential-recovery provider with a certified
  identity/reconnect path. Other provider connectors are provisional until a
  live certification run passes.
- Revive cannot resume state that the runtime did not persist.
- Revive cannot make an arbitrary third-party API exactly-once. The provider
  needs an idempotency key or a reliable reconciliation read.
- A successful signed probe proves network reachability and the callback
  contract. Run the kill/restart acceptance check against your actual runtime
  before production traffic.
- The current product is a design-partner alpha, not a general-availability
  guarantee for every framework, provider, or browser automation stack.
