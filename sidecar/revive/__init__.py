"""Revive — agent recovery control plane SDK.

Primary entrypoint (talks to the hosted control plane, stdlib-only, no deps):

    from revive import ReviveClient
    revive = ReviveClient("https://revivelabs.app", api_key="rv_live_…")
    result = revive.protect_action(run_id=..., connection_id=..., action_key=...,
                                   execute=lambda: do_the_side_effect())

When a protected action's credential dies mid-run, Revive classifies the
death, parks the run, routes a single-use reauthorization to the bound
account, rotates the credential lease, and resumes the same logical run
without duplicating a side effect that already committed.

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
]
__version__ = "0.1.0"
