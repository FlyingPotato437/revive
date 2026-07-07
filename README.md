# Revive

**Credential recovery control plane for durable workflows.**

Revive correlates an invalid credential grant to the affected logical run,
parks that run durably, sends a short-lived reauthorization request, rotates an
opaque credential lease, and resumes the failed action with a stable
idempotency key.

This repository contains a product console and a Python sidecar. The default
console remains an offline Microsoft-shaped sandbox. When Entra and storage
variables are configured, recovery uses a real Authorization Code + PKCE
callback and persists the resulting token set encrypted at rest.

## Recovery contract

```text
detect → bind run → checkpoint → reauthorize → rotate lease → replay once
```

1. **Detect** a provider failure and select a sourced recovery policy.
2. **Bind** the credential lease to the affected run and action.
3. **Checkpoint** the exact logical step in a durable store.
4. **Reauthorize** through a 256-bit, single-use link that expires after 15 minutes.
5. **Rotate** the credential lease to a new fencing generation.
6. **Replay once** using the original action idempotency key.

The worker that resumes the run may be a different process. Revive does not
depend on mutating credentials inside a live PID.

## Run the product console

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, choose **Skip to the live demo**, then start a
fault injection. Console recovery cases and their event buffers are stored in
`.revive/console-state.json` and survive a server restart.

## Configure hosted integrations

Copy `.env.example`, then register the exact `ENTRA_REDIRECT_URI` in Microsoft
Entra. The OAuth transaction is encrypted in an HttpOnly, SameSite cookie;
state is checked in constant time; PKCE uses S256; and a configured real flow
cannot be bypassed by the sandbox approval endpoint.

```bash
docker compose up -d postgres
npm run db:migrate
```

Call `POST /api/internal/jobs/drain` from a private worker or scheduler with
`Authorization: Bearer $REVIVE_WORKER_SECRET`. Jobs are claimed with
`FOR UPDATE SKIP LOCKED`, retried with exponential backoff and moved to `dead`
after their attempt limit. Outbound webhooks include `webhook-id`,
`webhook-timestamp`, `webhook-signature` and `idempotency-key` headers.

Nango connect sessions are exposed at
`POST /api/integrations/nango/connect-session`. Auth0 Token Vault exchange is a
server-only adapter so subject tokens are not returned through the browser.

Hosted recovery cases use signed, expiring recovery capabilities. A Nango
reconnect session reauthorizes the existing connection, Microsoft Graph `/me`
verifies the provider subject, and the control plane advances the credential
lease before a runtime can resume.

### Workspace-defined Nango connectors

Workspace operators can register a Nango integration that does not have a
built-in Revive adapter from **Connections → Custom Nango connectors**, or with:

```http
POST /api/workspaces/custom-connectors
Content-Type: application/json

{
  "integrationId": "linear",
  "label": "Linear",
  "identityProbe": {
    "path": "/users/me",
    "subjectField": "id",
    "tenantField": "organization.id",
    "accountField": "email"
  }
}
```

The integration must already exist in Nango. Revive executes the relative
probe path through Nango's proxy and binds the returned subject and tenant when
the connection is created. Recovery must return the same subject, tenant,
connection ID, and integration ID. Custom definitions cannot shadow built-in
adapters and are shown as **Provisional** because Revive cannot certify the
provider's identity-field stability. Prototype-pollution path segments and
absolute probe URLs are rejected.

### Project-scoped API keys

Every API key is bound to one workspace project and one role:

- `viewer`: read actions, recovery cases, and runtime endpoint configuration.
- `operator`: viewer access plus lifecycle ingest and control-plane mutations.
- `admin`: operator access plus runtime resume-endpoint configuration and tests.

Actions, recovery cases, transitions, and lifecycle ingest are all restricted
to the key's project. Cross-project identifiers return `404`; insufficient
roles return `403`. Workspace admins create and revoke keys in **API keys**.

## Run the sidecar tests

```bash
cd sidecar
python3 -m unittest discover -s tests -v
```

The suite covers provider classification, real HTTP recovery against the local
identity fixture, SQLite checkpoint persistence, worker-restart recovery and
one-time rendezvous consumption.

## ReviveBench

ReviveBench is an executable local correctness suite, not a console dashboard
and not a production-performance claim. It performs real HTTP calls against the
repository's local OAuth fixture and records five invariants: same-run resume,
worker-restart recovery, provider identity binding, generation fencing and
side-effect reconciliation.

```bash
npm run bench:revive
```

The command writes the observed report to
`benchmarks/results/revivebench-local.json`. The public `/benchmarks` page reads
that file as a whitepaper. If the report is missing, the page shows no numbers.
The methodology explicitly excludes customer recovery rate, provider-wide
compatibility, cost savings and availability claims.

The opt-in live certification uses a configured Nango connection, a durable
LangGraph SQLite checkpointer, and one temporary Microsoft Graph draft:

```bash
python3 -m venv .venv
.venv/bin/pip install -e 'sidecar[langgraph]'
npm run certify:live
```

It injects transport loss after Graph accepts the draft, reconciles upstream,
asserts one mutation and one remote draft, then deletes the draft. The result is
written to `benchmarks/results/revive-certification-live.json` and is presented
separately from local ReviveBench counts.

## Live recovery demo

The interactive Graph demo uses a real LangGraph checkpoint, hosted Revive
case, Nango reconnect session, signed runtime callback, and Microsoft Graph
mail action. It reads the profile and calendar, parks at `sendMail`, waits for
the account owner, then sends one temporary message to a mailbox you control.
It discards the `202 Accepted` response on purpose, reconciles Sent Items, and
asserts that the send endpoint ran once.

The Nango Microsoft integration must include `Mail.Send`, then the existing
connection must be reauthorized once. Run:

```bash
npm run demo:killer
```

The command launches an isolated control plane on port 3100 and prints the
one-time recovery URL. It creates and revokes its own one-day workspace API
key. By default it sends to the connected Microsoft test mailbox; set
`REVIVE_DEMO_RECIPIENT` to use another mailbox you control. It writes a live
artifact only after every assertion passes and cleans up matching Inbox, Sent
Items, and Drafts messages.

Slack, Jira, and Salesforce reconciliation endpoints are also implemented at
`POST /v1/actions/:id/reconcile-provider`. They use Slack message identifiers,
Jira issue keys or bounded search, and Salesforce external IDs. Their fixture
tests are local; do not call them live-certified until provider accounts have
been exercised.

## TypeScript SDK

The packageable TypeScript SDK lives in `sdk/typescript` and exposes the
action-level API Revive should sell to developers:

```bash
npm run sdk:build
```

The SDK wraps a workflow action with a stable idempotency key, action
registration, credential failure classification, recovery case creation and
optional side-effect reconciliation.

## Trust boundaries

Read `docs/trust-boundaries.md` for the token custody model, recovery state
machine, threat model, deployment options and hosted production gates.
Use `docs/production-runbook.md` for worker, backup, retention and key-rotation
operations. `docs/security-review-packet.md` defines the independent review
that remains required before general availability.

## Architecture

```text
lib/
  graph-codes.ts      sourced provider signal → policy catalog
  classifier.ts       normalized recovery decision
  engine.ts           run binding, lease generation and action ledger
  store.ts            atomic local persistence + SSE pub/sub
  oauth/entra.ts      real Entra Authorization Code + PKCE exchange
  hosted.ts           encrypted credential storage + Postgres job queue
  webhooks.ts         signed delivery and durable retry processing
  integrations/       Nango and Auth0 Token Vault adapters
app/app/               recovery lab, cases, connections and workspace UI
sidecar/revive/
  checkpoint.py       SQLite checkpoints, rendezvous and action attempts
  postgres.py         hosted Postgres implementation of the same contract
  engine.py           process-independent park/resume engine
  rendezvous.py       expiring one-time recovery capability
  adapters/           framework-native integrations
```

This development environment now has a live Entra/Nango connection and hosted
Postgres, and the checked-in certification artifact records one controlled
LangGraph/Microsoft Graph correctness run. External production gates remain:
deploy the queue worker, inject encryption keys from a managed secret manager
or KMS, configure hosted SSO/MFA, complete an isolated backup restore drill,
commission an independent security review, and repeat certification in a
design-partner staging tenant. Auth0 and a deployed Temporal namespace remain
uncertified integration options.
