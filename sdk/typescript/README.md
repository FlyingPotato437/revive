# revive-sdk

Agent recovery control plane SDK. Wrap a workflow action so that when its
credential fails, the run parks, the right account owner reconnects, and the
run resumes — without ever duplicating a side effect that already committed.

```bash
npm install revive-sdk
```

## Protect one action

```ts
import { ReviveClient } from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app",
  apiKey: process.env.REVIVE_API_KEY, // rv_live_…
});

const result = await revive.protectAction({
  runId: workflow.runId,
  checkpointId: workflow.checkpointId,
  connectionId: "conn_microsoft_ops",
  actionKey: "send_followup_email",
  // Policy facts only. Do not send message text or recipient addresses.
  riskContext: { operation: "outbound_message", recipientCount: 1 },
  credential: () => vault.lease("conn_microsoft_ops"),
  execute: ({ credential, idempotencyKey }) =>
    graph.sendMail(message, { credential, idempotencyKey }),
  // optional: prove a prior attempt did or did not commit before any replay
  reconcile: ({ idempotencyKey }) => graph.findMailByIdempotencyKey(idempotencyKey),
});

if (result.status === "parked") {
  // credential is dead — route result.recoveryCase.url to the account owner
} else {
  // result.value — executed exactly once, or the stored result on replay
}
```

The client registers the action, gates execution on the ledger verdict
(`safe_to_execute` / `already_committed` / `reconcile_first`), records the
attempt, and opens a recovery case when the credential is rejected. Idempotency
keys are derived from `runId + checkpointId + actionKey` when not supplied.

## Action contracts

`riskContext` lets a workspace evaluate policies against a compact action
contract. Supported facts are outbound-message recipient count, money movement,
destructive change, and a production target. The Vercel AI adapter derives
these locally and sends only the resulting facts to Revive, not the tool input.
Use `inferActionRisk(actionKey, input)` when writing another adapter.

## Vercel AI SDK

```ts
import { protectTools } from "revive-sdk/vercel-ai";

const tools = protectTools(revive, {
  runId: threadId,
  connectionId: "conn_microsoft_ops",
  protected: ["sendEmail", "createTicket"],
}, rawTools);
```

Each protected tool runs exactly once per run; a parked run resolves to a
structured result the model can surface to the user.

## Transports

- `HttpReviveTransport` (default when `baseUrl` is set) calls the hosted
  control plane.
- `MemoryReviveTransport` is an in-process implementation for local tests.
- Custom transports bind the same API to your own service.

## What Revive is not

Revive does not take custody of provider tokens — that stays with your
credential vault (Nango, Auth0, Entra). It coordinates the in-flight run
around a credential change: park, verify identity, fence stale workers,
reconcile, resume.

License: Apache-2.0 · [revivelabs.app](https://revivelabs.app)
