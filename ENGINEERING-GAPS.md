# Engineering status — honest boundary

Maturity today: design-partner alpha. Revive has a real hosted control plane,
but it is not yet an enterprise-ready general-availability service. Updated
2026-07-11.

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
  stale-worker fencing, replay protection, and resume-or-replan acknowledgement.
- Nango connector registry with certified Microsoft identity handling and
  provisional Google, GitHub, Slack, and workspace-defined connector support.
- TypeScript SDK, Python reporter/sidecar, MCP gateway, email delivery, Slack
  operational alerts, Stripe subscriptions, usage reporting, and billing portal.
- Public correctness evidence covering worker replacement, duplicate delivery,
  stale credentials, uncertain side effects, reconciliation, and a controlled
  live Nango/Microsoft Graph/LangGraph path. The evidence page states its limits.

## Required before broad production use

1. **Operate the worker continuously.** Deploy `npm run worker` beside hosted
   Postgres with queue-depth, oldest-job, failure, and heartbeat alerts. Add a
   transactional outbox and a dead-letter inspection/replay path.
2. **Use managed key custody.** Replace the single environment-held envelope
   secret with AWS KMS, GCP Cloud KMS, or an equivalent managed service and run
   a documented rotation exercise.
3. **Prove restore and deletion.** Run an isolated Postgres backup restore,
   verify workspace deletion/retention controls, and retain dated evidence.
4. **Complete independent security review.** Add dependency and container
   scanning, rate-limit verification, threat-model review, and an external
   assessment before accepting sensitive customer credentials at scale.
5. **Expand certified integrations.** Repeat the complete live recovery path
   across customer-like tenants. Microsoft is the current certified identity
   path; Google, GitHub, Slack, custom connectors, and Temporal remain
   provisional until their live golden paths pass.
6. **Add full observability.** Emit OpenTelemetry traces, metrics, and structured
   logs correlated by workspace, project, run, case, request, and action ID.
7. **Run the staging resilience campaign.** Execute 1,000+ recoveries with
   random worker kills, duplicate and out-of-order callbacks, post-commit
   timeouts, wrong identities, stale wakeups, database restarts, and provider
   outages. Publish the raw artifact, source commit, and container digest.
8. **Finish Python SDK parity.** The Python reporter covers telemetry; it still
   needs the complete hosted `/v1` action and recovery-case contract available
   in the TypeScript SDK.

## Product and evidence boundary

Nango and identity providers own credentials. LangGraph, Temporal, and other
runtimes own durable execution. Revive owns detection of human-dependent dead
runs, the secure human request, response validation, continuity fencing,
reconciliation, and the record of what happened.

Current benchmark results demonstrate controlled correctness, not customer
recovery rate, uptime, latency under load, or business ROI. Those claims require
operated design-partner traffic and the staging campaign above.
