# External security review packet

Provide this packet to an independent reviewer together with a staging tenant and read-only repository access.

## Review scope

- Nango reconnect session creation and completion
- signed recovery capabilities and expiry
- provider subject and tenant equality checks
- credential lease generation fencing
- action ledger and ambiguous side-effect reconciliation
- Postgres row-level security deployment role
- console sessions, organization memberships, and API key authorization
- queue worker authentication, webhook signing, retries, and dead-letter handling
- encryption envelope key rotation
- retention and deletion behavior

## Required test cases

1. Attempt recovery with a different Microsoft subject in the same tenant.
2. Attempt recovery with a subject from another tenant.
3. Replay an expired or already-used recovery capability.
4. Submit a stale lease generation after identity verification.
5. Reuse one idempotency key with a different connection.
6. Forge, delay, and replay signed webhooks.
7. Cross workspace boundaries through every console and `/v1` API.
8. Exercise SSRF controls on outbound webhook destinations.
9. Verify secrets and raw provider tokens never enter logs, workflow history, or evidence artifacts.
10. Restore a production-shaped backup into an isolated environment.

## Evidence to return

- threat model changes
- reproducible findings with severity and affected code path
- tenant-isolation test results
- authentication and session review
- cryptography and key-management review
- remediation verification
- explicit exclusions and residual risk

Revive must not claim an external security assessment until a named independent reviewer has completed and signed this work.
