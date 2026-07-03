"""Anthropic tool-use adapter (adapter preview).

Guard the tool-execution side of an Anthropic agent loop (Claude API tool use
or the Claude Agent SDK): each tool_use block that mutates an external system
becomes a protected action in the Revive ledger.

    from revive.client import ReviveClient
    from revive.adapters.anthropic_tools import ReviveToolGuard

    revive = ReviveClient(base_url="https://console.revivelabs.app", api_key="rv_live_…")
    guard = ReviveToolGuard(revive, connection_id="conn_…", protected={"send_email", "create_ticket"})

    # inside the agent loop, for each tool_use content block:
    result = guard.run(run_id=thread_id, tool_name=block.name, tool_input=block.input,
                       execute=lambda: dispatch_tool(block.name, block.input))

Committed replays return the stored result without re-dispatching; a dead
credential raises ReviveParkedError carrying the recovery URL, which the loop
should return to the model/user as the tool result.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Callable, Iterable, Optional

from revive.client import ReviveClient


class ReviveToolGuard:
    def __init__(
        self,
        client: ReviveClient,
        *,
        connection_id: str,
        protected: Optional[Iterable[str]] = None,
        lease_generation: Optional[int] = None,
    ):
        self.client = client
        self.connection_id = connection_id
        self.protected = set(protected) if protected is not None else None
        self.lease_generation = lease_generation

    def is_protected(self, tool_name: str) -> bool:
        return self.protected is None or tool_name in self.protected

    def run(self, *, run_id: str, tool_name: str, tool_input: Any, execute: Callable[[], Any]) -> Any:
        if not self.is_protected(tool_name):
            return execute()
        payload = json.dumps(tool_input, sort_keys=True, default=repr)
        derived = hashlib.sha256(f"{run_id}:{tool_name}:{payload}".encode()).hexdigest()
        return self.client.protect_action(
            run_id=run_id,
            connection_id=self.connection_id,
            action_key=tool_name,
            idem_key=derived,
            lease_generation=self.lease_generation,
            execute=execute,
        )
