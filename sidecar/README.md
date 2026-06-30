# revive-sidecar

Process-independent credential recovery for durable Python workflows.

The sidecar classifies a rejected OAuth grant, stores the checkpoint and
recovery rendezvous in SQLite, and resumes the same logical run after
reauthorization. Recovery links use 256 bits of entropy, expire after 15 minutes
and can be consumed once.

Mutating steps may opt into the action ledger. Revive supplies a stable action
ID, records started/completed state and refuses blind replay when an earlier
attempt may have committed. A reconcile callback can resolve ambiguous remote
state.

## Local development

The package is not represented as published yet. Install it from this folder:

```bash
python3 -m pip install -e .
python3 -m unittest discover -s tests -v
```

Run the offline examples against the local provider fixture:

```bash
python3 -m examples.nightly_briefing
python3 -m examples.langgraph_agent
python3 -m examples.parley_approval
```

## Core API

```python
from revive import CheckpointStore, Engine, Provider

store = CheckpointStore("revive.db")
provider = Provider("microsoft", token_url=TOKEN_URL, scopes=SCOPES)
engine = Engine(provider, store, base_url=RECOVERY_URL)

result = engine.run(run_id, steps, credential_lease, SCOPES)
```

The checkpoint, rendezvous and action attempt are durable. A new `Engine`
instance can load and resume a parked run after the original worker exits.

## Framework adapters

The LangGraph adapter reuses LangGraph's native `interrupt()` and checkpointer.
Revive supplies the auth-failure trigger and reauthorization payload; LangGraph
owns durable thread resumption. A production graph must use a durable
checkpointer rather than `MemorySaver`.

The Temporal adapter provides a `RecoveryGate` for workflows and a
`TemporalRecoveryClient` that signals an existing workflow execution with an
opaque connection ID and lease generation. Raw refresh tokens never enter
Temporal workflow history.

For hosted checkpointing, install `revive-sidecar[postgres]`, apply the root
Postgres migration and replace `CheckpointStore` with
`PostgresCheckpointStore(DATABASE_URL)`.

## Current limitations

- Automated tests use a local identity-provider fixture; live Entra verification requires an owned tenant.
- Durable webhook retry/DLQ delivery is owned by the hosted web control plane; the Python channel supports signing and bounded in-process retry.
- The package has not been released to PyPI.
- MCP Tasks remains roadmap work.

Apache-2.0.
