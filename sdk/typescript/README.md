# revive-sdk

Detect AI-agent runs lost to human-dependent blockers, get the right person to
resolve them, and resume the exact suspended run.

```bash
npm install revive-sdk
```

## Detect dead runs for free

```ts
import { ReviveClient, createLangGraphInterruptHandler } from "revive-sdk";

const revive = new ReviveClient({
  baseUrl: "https://revivelabs.app/api",
  apiKey: process.env.REVIVE_API_KEY, // rv_live_…
});

const detect = createLangGraphInterruptHandler(revive);

await detect({
  runId: workflow.runId,
  checkpointId: workflow.checkpointId,
  generation: workflow.generation,
  failureMessage: error.message,
  trace: workflow.trace,
  inputTokens: usage.input,
  outputTokens: usage.output,
  estimatedCostUsd: usage.costUsd,
});
```

Use `createTemporalFailureSignal` or `createMcpElicitationHandler` at the
equivalent interrupt boundary. Detection returns the blocker category,
confidence, smallest suggested ask, recipient role, and recoverability.

## Resolve a recoverable run

```ts
const { request } = await revive.reviveDeadRun({
  deadRunId: detected.id,
  recipient: {
    subjectId: "quickbooks-account-owner",
    email: "owner@customer.com",
  },
  destinationUrl: "https://connect.example.com/quickbooks",
});

console.log(request.url);
```

The secure response is bound to recipient, run, checkpoint, and generation.
Revive validates declared fields, checks whether the paused context should
resume, replan, or enter manual review, then emits a signed continuation.

## Protect a write

`protectAction` remains available for exactly-once external writes, provider
reconciliation, and credential recovery. This prevents a resumed run from
duplicating a side effect that may already have committed.

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

Revive is not a workflow runtime, credential vault, or reasoning-observability
tool. LangGraph or Temporal owns durable execution; Nango, Auth0, or your vault
owns provider tokens. Revive owns dead-run detection and the secure human
action that returns to the correct suspended execution.

License: Apache-2.0 · [revivelabs.app](https://revivelabs.app)
