# revive-sdk

Detect AI-agent runs lost to human-dependent blockers, route the smallest
secure action to the right person, and resume the exact suspended run.

```bash
pip install revive-sdk
```

## Detect dead runs for free

```python
from revive import ReviveClient, create_langgraph_interrupt_handler

revive = ReviveClient("https://revivelabs.app/api", api_key="rv_live_…")
detect = create_langgraph_interrupt_handler(revive)

dead_run = detect(
    run_id=state["run_id"],
    checkpoint_id=state["checkpoint_id"],
    generation=state["generation"],
    failure_message=str(error),
    trace=state["trace"],
    input_tokens=usage.input_tokens,
    output_tokens=usage.output_tokens,
    estimated_cost_usd=usage.cost_usd,
)
```

`create_temporal_failure_signal` and `create_mcp_elicitation_handler` expose
the same call at those runtimes' existing boundaries. Detection classifies the
blocker and loss without contacting an end user.

Resolve only selected recoverable runs:

```python
resolution = revive.revive_dead_run(
    dead_run["id"],
    recipient={"subjectId": "account-owner", "email": "owner@customer.com"},
    destination_url="https://connect.example.com/quickbooks",
)
```

## Protect one write

```python
from revive import ReviveClient, ReviveParkedError

revive = ReviveClient("https://revivelabs.app/api", api_key="rv_live_…")

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

Python now exposes the same hosted recovery surface as the TypeScript SDK:
`request_action`, `get_action_request`, `cancel_action_request`,
`create_transaction`, `transition_transaction_step`, and
`decide_transaction`. `protect_action` also accepts `reconcile`,
`reconcile_hints`, and privacy-preserving `risk_context` arguments.

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

serve(ResumeReceiver(
    secret=os.environ["REVIVE_RESUME_SECRET"],
    resume=resume,
    dedupe_path=".revive/resume-receipts.db",
), port=8752)
```

`dedupe_path` persists successful callback acknowledgements across receiver
restarts. Set `REVIVE_RECEIVER_DB` to configure the same store without changing
code. The handler and receipt write are serialized for simultaneous retries;
the runtime's run/checkpoint idempotency remains the crash-safety boundary if a
process exits before a successful receipt is committed.

Reference receivers and a full runnable loop live in `examples/`:
`resume_receiver_fastapi.py`, `resume_receiver_express.js`, and
`langgraph_resume_endpoint.py` (park → signed callback → same-thread resume,
end to end).

## What Revive is not

Revive is not the workflow runtime, credential vault, or reasoning tracer.
LangGraph or Temporal owns durable execution; Nango, Auth0, or your vault owns
provider tokens. Revive owns dead-run detection and the secure human action
that returns to the correct suspended execution.

## Self-hosting (optional)

The package also ships the local park/resume engine (`Engine`,
`CheckpointStore`, `PostgresCheckpointStore`) for running the recovery loop
in-process instead of against the hosted control plane. See the repository.

Extras: `revive-sdk[langgraph]`, `revive-sdk[temporal]`, `revive-sdk[postgres]`.

License: Apache-2.0 · https://revivelabs.app
