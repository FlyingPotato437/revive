# Revive production runbook

This runbook defines the minimum operated deployment for a design-partner pilot. It does not represent a compliance certification.

## Web control plane

Deploy the Next.js service at `https://revivelabs.app` with managed Postgres, hosting secret-manager injection, a concrete Entra tenant, and the `microsoft-tenant-specific` Nango integration. Run `npm run db:migrate` as a release step before routing traffic to a new version.

## Queue worker

The worker is a separate long-running process. The Render blueprint is `deploy/render.yaml`; its container is `deploy/worker.Dockerfile`.

```text
REVIVE_BASE_URL=https://revivelabs.app
REVIVE_WORKER_SECRET=<secret-manager reference>
REVIVE_WORKER_ID=<stable replica name>
```

Monitor `GET /api/internal/worker/health` with `Authorization: Bearer $REVIVE_HEALTH_SECRET`. Alert on HTTP 503, stale heartbeat, or any dead jobs.

The runtime adapter receives a signed `recovery.resume_requested` event at `REVIVE_RUNTIME_RESUME_URL`. It must reconcile any uncertain side effect, resume the original checkpoint, and return JSON containing `{"ok":true,"resumed":true,"runId":"...","checkpointId":"..."}`. Revive does not mark the case resumed on a generic HTTP 200 or a mismatched run/checkpoint acknowledgement.

## Backups and recovery drills

Managed Postgres point-in-time recovery is the primary control. The repository backup command produces a second portable artifact:

```bash
npm run db:backup
REVIVE_RESTORE_CONFIRM=RESTORE_REVIVE_DATABASE npm run db:restore -- .revive/backups/revive-<timestamp>.dump
```

Store backups in an encrypted bucket with object versioning and a retention lock. Run a restore into an isolated database at least quarterly. Record restore duration and row-count checks.

## Encryption key rotation

Use a secret manager to inject a JSON keyring:

```text
REVIVE_ENCRYPTION_KEYS={"2026-07":"<base64-32-byte-key>","2026-04":"<previous-key>"}
REVIVE_ACTIVE_ENCRYPTION_KEY_ID=2026-07
```

New envelopes use the active key ID. Old envelopes remain readable while their keys remain in the keyring. Rotate by adding a key, switching the active ID, re-encrypting stored envelopes, and removing the retired key after verification.

## Retention

Schedule `npm run retention` daily with the worker secret. Defaults:

- completed queue jobs: 14 days
- dead jobs: 90 days
- resolved recovery cases: 365 days
- audit events: retained; customer deletion requires an approved audit-retention policy

## Incident response

1. Stop new recovery sessions if identity verification is suspect.
2. Keep affected workflows parked.
3. Rotate worker, webhook, and application secrets as required.
4. Export append-only audit records for the affected workspace.
5. Reconcile every action left in `started` or `uncertain` before replay.
6. Resume only with the current credential lease generation.

## External gates

Before accepting general customer credentials, commission an independent architecture review and penetration test. Track every finding to closure. SOC 2 readiness and legal privacy review are separate workstreams and cannot be self-attested by this repository.
