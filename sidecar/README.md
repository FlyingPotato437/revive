# revive-sdk

Agent recovery control plane SDK for Python. Wrap an agent's real-world action
so that when its credential fails, the run parks, the right account owner
reconnects, and the run resumes — without ever duplicating a side effect that
already committed.

```bash
pip install revive-sdk
```

## Protect one action

```python
from revive import ReviveClient, ReviveParkedError

revive = ReviveClient("https://revivelabs.app", api_key="rv_live_…")

try:
    result = revive.protect_action(
        run_id=run_id,
        connection_id="conn_microsoft_ops",
        action_key="send_followup_email",
        execute=lambda: graph_send_mail(message),   # your real side effect
    )
    # executed exactly once; a retry returns the stored result, never re-sends
except ReviveParkedError as parked:
    # the credential is dead — send parked.parked.recovery_url to the account owner
    notify(parked.parked.recovery_url)
```

`protect_action` registers the action, gates execution on the ledger verdict
(`safe_to_execute` / `already_committed` / `reconcile_first`), records the
attempt, and opens a recovery case when the credential is rejected. Idempotency
keys are derived from `run_id + action_key` unless you pass `idem_key`.

## Framework adapters

```python
# OpenAI Agents SDK — protect a function tool
from revive.adapters.openai_agents import revive_tool

@revive_tool(revive, connection_id="conn_microsoft_ops")
def send_followup_email(run_id: str, to: str, subject: str) -> dict:
    ...

# Anthropic tool use — guard the tool-execution side of the loop
from revive.adapters.anthropic_tools import ReviveToolGuard
guard = ReviveToolGuard(revive, connection_id="conn_microsoft_ops",
                        protected={"send_email", "create_ticket"})

# LangGraph — see revive.adapters.langgraph (install with: pip install "revive-sdk[langgraph]")
```

## What Revive is not

Revive does not take custody of provider tokens — that stays with your
credential vault (Nango, Auth0, Entra). It coordinates the in-flight run
around a credential change: park, verify identity, fence stale workers,
reconcile, resume.

## Self-hosting (optional)

The package also ships the local park/resume engine (`Engine`,
`CheckpointStore`, `PostgresCheckpointStore`) for running the recovery loop
in-process instead of against the hosted control plane. See the repository.

Extras: `revive-sdk[langgraph]`, `revive-sdk[temporal]`, `revive-sdk[postgres]`.

License: Apache-2.0 · https://revivelabs.app
