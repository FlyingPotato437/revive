"""Revive — dead-run recovery SDK.

Primary entrypoint (talks to the hosted control plane, stdlib-only, no deps):

    from revive import ReviveClient
    revive = ReviveClient("https://revivelabs.app/api", api_key="rv_live_…")
    dead_run = revive.detect_dead_run(run_id=..., failure_message=...)

Revive classifies terminal runs, routes a secure human action to the selected
recipient, validates the response, and continues the same logical run. The
existing action ledger prevents resumed work from duplicating committed writes.

Framework adapters live under revive.adapters (OpenAI Agents, Anthropic tool
use, LangGraph). The local self-hosted engine (Engine, CheckpointStore, …)
remains available for running the park/resume loop in-process.
"""
# Hosted SDK entrypoint — the primary developer API.
from .client import (AmbiguousCommitError, ParkedRun, ReviveClient,
                     ReviveParkedError, idempotency_key)

from .checkpoint import Checkpoint, CheckpointStore
from .classifier import ClassifierResult, Verdict, classify
from .engine import (AmbiguousSideEffect, Completed, Engine, NeedsApproval,
                     Parked, StaleCredentialGeneration, Step, StepContext,
                     WrongRecoveryIdentity)
from .providers import AuthError, Provider, Token, TokenError
from .rendezvous import Kind, Rendezvous, console_channel, webhook_channel
from .receiver import ResumeReceiver, verify_signature
from .postgres import PostgresCheckpointStore
from .reporter import Reporter
from .adapters.dead_runs import (create_langgraph_interrupt_handler,
                                 create_mcp_elicitation_handler,
                                 create_temporal_failure_signal)

__all__ = [
    "ReviveClient", "ReviveParkedError", "ParkedRun", "AmbiguousCommitError", "idempotency_key",
    "Engine", "Step", "StepContext", "Parked", "Completed", "NeedsApproval",
    "AmbiguousSideEffect",
    "WrongRecoveryIdentity", "StaleCredentialGeneration",
    "Provider", "Token", "TokenError", "AuthError",
    "CheckpointStore", "Checkpoint",
    "PostgresCheckpointStore",
    "Reporter",
    "classify", "ClassifierResult", "Verdict",
    "Rendezvous", "Kind", "console_channel", "webhook_channel",
    "ResumeReceiver", "verify_signature",
    "create_langgraph_interrupt_handler", "create_temporal_failure_signal",
    "create_mcp_elicitation_handler",
]
__version__ = "0.1.0"
