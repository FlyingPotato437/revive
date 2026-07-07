# Engineering gaps — honest status

Maturity today: strong technical prototype, early alpha. This file tracks the
distance to a design-partner alpha and a hosted SaaS, so nobody (including us)
mistakes a demo for a product. Updated 2026-07-01.

## Done recently (this repo)

- `/v1` control-plane API: `POST/GET /v1/actions`, `POST /v1/actions/:id/complete`,
  `POST /v1/actions/:id/reconciled`, `POST/GET /v1/recovery-cases`,
  `GET /v1/recovery-cases/:id`, `POST /v1/recovery-cases/:id/transition`.
  Bearer API-key auth (hashed, constant-time compare, revocation enforced,
  last-used tracked). Explicit state machine with atomic version checks — the
  only write path for case state. Rewrite maps public `/v1/*` onto the routes.
- TypeScript SDK connects: `new ReviveClient({ baseUrl, apiKey })` uses the HTTP
  transport against those endpoints (verified live: happy path + parked case).
- Python sidecar `Reporter` streams case lifecycle into the console.
- Entra identity binding: issuer/oid/tid from the id_token, trust-on-first-use,
  scope coverage check; email demoted to display metadata.
- `admin_consent_required` classification (AADSTS90094, AADSTS650052) in both
  classifiers, routed to org-admin remediation.
- Tenancy migration (0003): organizations/workspaces/memberships/api-keys,
  control-plane tables, tenant-scoped uniqueness, forced RLS with default-deny
  policies, append-only audit table.
- Persistent worker (`npm run worker`): continuous drain, adaptive backoff,
  graceful shutdown, stall alert.
- P0 dedupe closed: /v1/actions returns a registration verdict
  (new|completed|uncertain|reconciled + resultRef); the SDK executes only on
  "new", returns stored results for completed/reconciled, and requires
  reconciliation for uncertain. Covered by scripts/test-control-plane.mts.
- State machine hardened: "completed" reachable only from resumed/reconciled;
  rejected/expired/escalated/manual_review remain escape terminals.
- Entra id_token fully verified: JWKS RS256 signature, exact issuer, audience,
  expiry, and a nonce bound to the PKCE flow. Identity binding prefers the
  connection's creation-time binding; run binding second; sandbox first-use
  fallback is audited.
- Audit events now written (local JSONL + Postgres when hosted) for action
  registration/replay, case open/transition, and OAuth identity verification.
- API keys support expiration (enforced in auth) alongside revocation.
- Case detail renders REAL control-plane transitions and the real action
  ledger for hosted cases — nothing reconstructed.
- Integration tests: `npm run test:api` (14 checks) against a running server.
- Postgres control-plane repository: actions and recovery cases use tenant-scoped
  transactions with `revive.workspace_id`, row locks, optimistic versions and
  RLS whenever `DATABASE_URL` is configured. Local JSON remains sandbox-only.
- Hosted API keys are persisted in Postgres, carry a non-secret workspace locator
  so RLS can be established before hash lookup, support selectable expiration,
  and reject revoked/expired keys. Audit inserts use the same RLS transaction.
- Production recovery no longer permits first-use identity binding: a connection
  must already have subject + tenant identity. First-use remains local-sandbox only.

- Connector registry (2026-07-06): identity adapters for Microsoft, Google
  (userinfo + Gmail profile), GitHub, and Slack behind one provider registry
  (`lib/integrations/providers.ts`). Connect-session defaults, creation-time
  binding, recovery reconnect, and identity verification are provider-generic;
  reconnect reuses the connection's own integration id instead of the
  allowlist head. Console offers one connect button per allowlisted
  integration; the recovery page renders provider-aware copy. Enable with
  NANGO_ALLOWED_INTEGRATIONS (integrations must exist in the Nango project).
  Microsoft remains the only CERTIFIED path; the others are provisional until
  a live golden path is walked per provider.

- Workspace custom connectors (2026-07-06): operators can register any Nango
  integration id with a relative identity-probe path and safe subject, tenant,
  and account dot paths. Built-ins take precedence. Subject and tenant must be
  non-empty at creation-time binding and recovery, or Revive rejects the
  connection. Custom definitions and connections are visibly provisional.
- API-key least privilege (2026-07-06): every key now has one required project
  and a viewer, operator, or admin role. Project id is persisted on actions and
  recovery cases and enforced on lists, lookups, transitions, reconciliation,
  and lifecycle ingest. Existing keys and records migrate to the workspace's
  default project. Hosted cross-project mutation and listing tests pass.

## Design-partner review remainder (2026-07-02)

Blocked on accounts/infra the team must provision (not code):

- **Continuous worker deployment.** `npm run worker` blueprint exists; needs a
  deploy target (Render/Fly/Railway) running it 24/7 next to Postgres.
- **Hosted SSO/MFA with session revocation.** Login is Postgres+scrypt. Plan:
  Clerk. Needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` before
  wiring.
- **Managed KMS.** Envelope keys are injectable/versioned but no cloud KMS is
  provisioned (AWS KMS or GCP Cloud KMS + key id in env).
- **Isolated restore drill** of the Postgres backup, and an **independent
  security assessment** — both organizational, not code.
- **Golden path — live identity half DONE (2026-07-02).** Real Entra OAuth via
  Nango connect-session → real `GET /v1.0/me` (oid c929470a, upn
  srikanth@revivelabs.app, tenant 1c263647) → case walked
  detected→classified→parked→awaiting_authorization→identity_verified against
  the creation-time binding (production path) → lease rotated 1→2 → stale gen-1
  worker fenced (409), gen-2 accepted. Evidence:
  `benchmarks/results/golden-path-live.json`. NOTE: uses Nango's own valid Entra
  secret, so the direct-PKCE `ENTRA_CLIENT_SECRET` (fails AADSTS7000215 — secret
  VALUE vs ID) is no longer a blocker for this path.
  REMAINING half DONE (2026-07-05): per-workspace resume endpoint registration
  shipped — `POST /v1/workspace/resume-endpoint` stores URL + shared secret
  envelope-encrypted in `revive_workspace_secrets`; `identity_verified` (via v1
  transition or Nango completion) now enqueues the signed
  `recovery.resume_requested` callback against the workspace endpoint (env pair
  remains the single-tenant fallback), and delivery resolves the secret at send
  time. Verified locally end to end: case case_XHfwtWcZBAWt walked
  identity_verified→resumed→completed with the reference receiver
  (`revive.receiver`) verifying HMAC and acking; LangGraph same-thread resume
  demonstrated in `sidecar/examples/langgraph_resume_endpoint.py` (parked at
  step 4/8, signed callback, finished 8/8 on one thread). REMAINING: deploy the
  new control-plane code (the production worker still runs the env-var-only
  build) and stand up a DEPLOYED customer receiver for the live golden path.
- **Temporal certification.** Adapter is preview; needs a Temporal cluster.
- **Evidence breadth.** Current evidence is correctness + local control-plane
  latency (`benchmarks/results/recovery-latency-local.json`, honestly caveated).
  Latency/availability/MTTR/recovery-rate under load require the staging
  campaign (item 8 below).

## Open — ordered

1. **One certified path: LangGraph Python + Nango + Microsoft Graph.**
   Full sequence: real Graph failure → classified → case → scoped Nango connect
   session → subject/tenant/scope verification → atomic generation bump → stale
   worker fenced → reconcile → LangGraph resume → timeline. Store opaque Nango
   connection references; do not duplicate token custody. Auth0 second.
2. **Python SDK parity with `/v1`.** The sidecar engine still runs its own local
   store; it should register actions and open cases against the hosted API the
   way the TS SDK does (Reporter covers telemetry, not the ledger contract).
3. **Key scoping + roles.** Keys are workspace-scoped only. Need
   project/environment scoping and rotation; owner/admin/operator/viewer
   roles; SSO + MFA.
4. **Queue operations.** Worker exists; still missing transactional outbox
   writes, DLQ inspection/replay UI, queue-depth/oldest-job metrics.
5. **Secrets.** Single `REVIVE_SECRET` envelope. Need KMS-backed envelope
   encryption with rotation and a secret-manager deployment.
6. **Observability.** OpenTelemetry traces/metrics/logs correlated by
   run/case/action id. Currently console logs only.
7. **Operator console gaps.** Case-detail timeline exists; still missing
   p50/p95 recovery time, duplicates-prevented counters, queue health on
   Overview; scope-drift view on Connections.
8. **ReviveBench staging campaign.** 40/40 local proves deterministic
    correctness only. Needed: 1,000+ runs on staging with random worker kills,
    duplicate/out-of-order webhooks, post-commit timeouts, wrong tenant/account,
    stale wakeups, DB/queue restarts, provider outages. Publish raw results +
    commit + container digest.
9. **Ops basics before real customer credentials.** Backups with tested
    restore, rate limits, dependency/container scanning, retention/deletion
    controls, external pen test.

## Boundary (unchanged)

Nango/Auth0 own credentials. LangGraph/Temporal own execution. Revive owns
identity verification, recovery coordination, fencing, reconciliation, and the
record of what happened. Not a vault, not a workflow engine, not observability.
