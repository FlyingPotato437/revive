"""OpenAI Agents SDK adapter (adapter preview).

Wrap a function tool so every invocation is a protected action in the Revive
ledger: replays of committed calls return the stored result, uncertain calls
demand reconciliation, and credential failures park the run with a recovery
case instead of crashing the agent.

    from agents import function_tool
    from revive.client import ReviveClient
    from revive.adapters.openai_agents import revive_tool

    revive = ReviveClient(base_url="https://console.revivelabs.app", api_key="rv_live_…")

    @function_tool
    @revive_tool(revive, connection_id="conn_…", run_id_from="run_id")
    def send_followup_email(run_id: str, to: str, subject: str) -> dict:
        ...  # real provider call

The wrapped function raises ReviveParkedError when the credential dies; the
agent loop should surface parked.recovery_url to the account owner.
"""

from __future__ import annotations

import functools
import json
from typing import Any, Callable, Optional

from revive.client import ReviveClient


def revive_tool(
    client: ReviveClient,
    *,
    connection_id: str,
    run_id_from: str = "run_id",
    action_key: Optional[str] = None,
    lease_generation: Optional[int] = None,
):
    """Decorator: one exactly-once ledger entry per (run, tool, arguments)."""

    def decorate(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            run_id = str(kwargs.get(run_id_from) or "")
            if not run_id:
                raise ValueError(f"revive_tool requires the '{run_id_from}' keyword argument")
            key_material = json.dumps({"args": [repr(a) for a in args], "kwargs": {k: repr(v) for k, v in sorted(kwargs.items())}}, sort_keys=True)
            import hashlib

            derived = hashlib.sha256(f"{run_id}:{func.__name__}:{key_material}".encode()).hexdigest()
            return client.protect_action(
                run_id=run_id,
                connection_id=connection_id,
                action_key=action_key or func.__name__,
                idem_key=derived,
                lease_generation=lease_generation,
                execute=lambda: func(*args, **kwargs),
            )

        return wrapper

    return decorate
