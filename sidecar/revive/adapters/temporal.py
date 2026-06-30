"""Temporal signal adapter for Revive recovery rendezvous.

Activities detect/classify credential failures. A workflow parks by waiting on a
RecoveryGate. The OAuth callback signals the existing workflow ID with a new
opaque lease reference; raw refresh tokens do not enter workflow history.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Optional

SIGNAL_NAME = "revive_reauthorized"

try:
    from temporalio import workflow  # type: ignore
    HAS_TEMPORAL = True
except ImportError:  # pragma: no cover - optional dependency
    HAS_TEMPORAL = False

    class _WorkflowFallback:
        @staticmethod
        def signal(*args, **kwargs):
            def decorate(fn):
                return fn
            return decorate

        @staticmethod
        async def wait_condition(predicate):
            raise RuntimeError("temporalio is not installed: pip install 'revive-sidecar[temporal]'")

    workflow = _WorkflowFallback()  # type: ignore


@dataclass(frozen=True)
class ReauthorizationSignal:
    recovery_case_id: str
    connection_id: str
    lease_generation: int
    provider: str


class RecoveryGate:
    """Mixin/state holder for a Temporal workflow that can wait for reauthorization."""

    def __init__(self) -> None:
        self._revive_signals: dict[str, dict[str, Any]] = {}

    @workflow.signal(name=SIGNAL_NAME)
    def revive_reauthorized(self, payload: dict[str, Any]) -> None:
        case_id = str(payload["recovery_case_id"])
        self._revive_signals[case_id] = dict(payload)

    async def wait_for_reauthorization(self, recovery_case_id: str) -> dict[str, Any]:
        await workflow.wait_condition(lambda: recovery_case_id in self._revive_signals)
        return self._revive_signals.pop(recovery_case_id)


class TemporalRecoveryClient:
    def __init__(self, client: Any, signal_name: str = SIGNAL_NAME):
        self.client = client
        self.signal_name = signal_name

    async def resume(self, workflow_id: str, signal: ReauthorizationSignal,
                     run_id: Optional[str] = None) -> None:
        kwargs = {"run_id": run_id} if run_id else {}
        handle = self.client.get_workflow_handle(workflow_id, **kwargs)
        await handle.signal(self.signal_name, asdict(signal))
