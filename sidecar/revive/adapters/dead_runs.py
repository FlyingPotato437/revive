"""One-line dead-run adapters for existing runtime interrupt boundaries."""
from __future__ import annotations

from typing import Any, Callable

from ..client import ReviveClient


def _handler(client: ReviveClient, runtime: str) -> Callable[..., dict]:
    def report(*, run_id: str, failure_message: str, **kwargs: Any) -> dict:
        return client.detect_dead_run(
            run_id=run_id,
            failure_message=failure_message,
            runtime=runtime,
            **kwargs,
        )

    return report


def create_langgraph_interrupt_handler(client: ReviveClient) -> Callable[..., dict]:
    return _handler(client, "langgraph")


def create_temporal_failure_signal(client: ReviveClient) -> Callable[..., dict]:
    return _handler(client, "temporal")


def create_mcp_elicitation_handler(client: ReviveClient) -> Callable[..., dict]:
    return _handler(client, "mcp")
