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

## Resume endpoint — let the control plane restart your runs

Register a resume endpoint once per workspace and recovery closes the loop
automatically: the moment the account owner re-authorizes
(`identity_verified`), the control plane rotates the credential lease and
delivers a signed `recovery.resume_requested` callback to your runtime; your
runtime resumes the parked run from its checkpoint and acks, and the case
walks `identity_verified → resumed → completed`. Without a registered
endpoint the run stays parked for an operator.

```bash
# register (URL + shared secret, stored encrypted per workspace)
curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint \
  -H "authorization: Bearer $REVIVE_API_KEY" -H "content-type: application/json" \
  -d '{"url": "https://agents.example.com/revive/resume", "secret": "'$REVIVE_RESUME_SECRET'"}'

# send a signed test event to confirm the wiring
curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint/test \
  -H "authorization: Bearer $REVIVE_API_KEY"
```

The receiver side is three lines with the bundled reference implementation
(stdlib-only — HMAC verification, replay-window check, idempotent retries):

```python
from revive.receiver import ResumeReceiver, serve

def resume(data):  # resume the parked run, e.g. LangGraph:
    graph, config = runs[data["runId"]]
    graph.invoke(Command(resume={"connection_id": data["connectionId"],
                                 "lease_generation": data["generation"]}), config)

serve(ResumeReceiver(secret=os.environ["REVIVE_RESUME_SECRET"], resume=resume), port=8752)
```

Reference receivers and a full runnable loop live in `examples/`:
`resume_receiver_fastapi.py`, `resume_receiver_express.js`, and
`langgraph_resume_endpoint.py` (park → signed callback → same-thread resume,
end to end).

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
