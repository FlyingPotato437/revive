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

## Run the sidecar tests

```bash
cd sidecar
python3 -m unittest discover -s tests -v
```

The suite covers provider classification, real HTTP recovery against the local
identity fixture, SQLite checkpoint persistence, worker-restart recovery and
one-time rendezvous consumption.

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

The repository contains these integration paths, but external provisioning is
still required: owned Entra/Nango/Auth0 tenants, managed Postgres, a secret
manager/KMS, a continuously scheduled queue worker and a Temporal namespace.
Exercise the paths against staging tenants before accepting customer credentials.
