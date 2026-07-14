# Engineering status — honest boundary

Maturity today: design-partner alpha. Revive has a real hosted control plane,
but it is not yet an enterprise-ready general-availability service. Updated
2026-07-13.

## Working now

- Hosted Clerk authentication, organizations, workspace membership, roles, SSO
  entry points, and session revocation.
- Postgres tenancy with forced row-level security, project-scoped API keys,
  key roles, expiration, revocation, audit events, and optimistic state changes.
- Dead-run ingestion and redaction, deterministic plus Claude-assisted
  classification, blocker analytics, and paste-a-trace analysis.
- Secure user-action requests for approvals, clarification, reauthorization,
  verification, permissions, and browser handoff. Requests have declared fields,
  recipient binding, expiry, one-use completion, and resume status.
- Workspace approval policies, typed risk guardrails, policy previews, and
  natural-language policy drafts. Claude receives only redacted policy text;
  schema normalization remains deterministic and drafts require admin review.
- Per-workspace signed resume endpoints, checkpoint and generation binding,
  stale-worker fencing, replay protection, durable receiver receipts, and
  resume-or-replan acknowledgement.
- Transactional outbox records for completed human actions and verified
  identities, with atomic credential-generation rotation at verification time.
- Nango connector registry with certified Microsoft identity handling and
  provisional Google, GitHub, Slack, and workspace-defined connector support.
- TypeScript SDK, Python reporter/sidecar, MCP gateway, email delivery, Slack
  operational alerts, Stripe subscriptions, usage reporting, and billing portal.
- Public correctness evidence covering worker replacement, duplicate delivery,
  stale credentials, uncertain side effects, reconciliation, and a controlled
  live Nango/Microsoft Graph/LangGraph path. The evidence page states its limits.
- A self-contained interactive golden run proving detect, identity-bound human
  action, signed continuation, ambiguous-write reconciliation, duplicate
  delivery suppression, and outcome verification without external credentials.
- A deterministic 1,000-run local fault campaign covering worker replacement,
  post-commit response loss, stale wakeups, wrong identities, lease fencing,
  and durable callback replay. It is explicitly not a hosted load claim.
- Versioned envelope-key rings, secret-file mounts, full-envelope verification,
  and a rewrap command for managed-key rotation exercises.
- Python/TypeScript hosted SDK parity for human actions, outcome transactions,
  risk facts, and provider reconciliation.

## Required before broad production use

1. **Operate the worker continuously.** Deploy `npm run worker` beside hosted
   Postgres with queue-depth, oldest-job, failure, and heartbeat alerts. The
   transactional outbox and dead-letter replay path exist; production alerting
   still needs to be wired to the chosen infrastructure.
2. **Use managed key custody in the deployed environment.** Mount the versioned
   keyring from AWS KMS, GCP Cloud KMS, or an equivalent managed service and run
   the implemented verify/rewrap command as a documented rotation exercise.
3. **Prove restore and deletion.** Run an isolated Postgres backup restore,
   verify workspace deletion/retention controls, and retain dated evidence.
4. **Complete independent security review.** Add dependency and container
   scanning, rate-limit verification, threat-model review, and an external
   assessment before accepting sensitive customer credentials at scale.
5. **Expand certified integrations.** Repeat the complete live recovery path
   across customer-like tenants. Microsoft is the current certified identity
   path; Google, GitHub, Slack, custom connectors, and Temporal remain
   provisional until their live golden paths pass.
6. **Expand observability.** Critical completion, transition, and resume spans
   now export over OTLP/HTTP. Add queue/provider metrics and broader structured
   logs correlated by workspace, project, run, case, request, and action ID.
7. **Run the staging resilience campaign.** Repeat the implemented 1,000-run
   local fault matrix against deployed containers, adding real process kills,
   database restarts, and provider outages. Publish the raw artifact, source
   commit, and container digest.

## Product and evidence boundary

Nango and identity providers own credentials. LangGraph, Temporal, and other
runtimes own durable execution. Revive owns detection of human-dependent dead
runs, the secure human request, response validation, continuity fencing,
reconciliation, and the record of what happened.

Current benchmark results demonstrate controlled correctness, not customer
recovery rate, uptime, latency under load, or business ROI. Those claims require
operated design-partner traffic and the staging campaign above.
