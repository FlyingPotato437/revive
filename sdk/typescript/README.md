# @revive/workflows

TypeScript SDK for binding credential recovery to durable workflow actions.

The SDK wraps one mutating or credentialed action with:

- stable idempotency keys
- action registration
- credential failure classification
- recovery case creation
- optional side-effect reconciliation

## Install

```bash
npm install @revive/workflows
```

## Basic usage

```ts
import { HttpReviveTransport, ReviveClient } from "@revive/workflows";

const revive = new ReviveClient({
  transport: new HttpReviveTransport({
    baseUrl: process.env.REVIVE_URL!,
    apiKey: process.env.REVIVE_API_KEY!,
  }),
});

const result = await revive.protectAction({
  runId: "run_42",
  checkpointId: "step_7",
  connectionId: "conn_gmail_123",
  actionKey: "gmail.send",
  credential: () => vault.getLease("conn_gmail_123"),
  execute: async ({ credential, idempotencyKey }) => {
    return gmail.send({
      token: credential.accessToken,
      idempotencyKey,
      to: "operator@example.com",
      subject: "Daily briefing",
      body: "Ready.",
    });
  },
  reconcile: async ({ idempotencyKey }) => {
    const message = await gmail.findSentMessage({ idempotencyKey });
    return { committed: Boolean(message), value: message, remoteId: message?.id };
  },
});

if (result.status === "parked") {
  console.log(result.recoveryCase.url);
}
```

## Transport model

The SDK separates the developer API from the hosted control plane.

- `MemoryReviveTransport` is useful for local tests.
- `HttpReviveTransport` calls a hosted Revive API.
- Custom transports can bind the same API to Temporal, LangGraph, Restate or an internal service.

Raw refresh tokens should stay in the customer's vault. The SDK expects a credential lease object and sends Revive the run, action, checkpoint and recovery metadata.
