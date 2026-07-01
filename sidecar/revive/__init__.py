"""Revive — run-level dead-reauth-resume for long-running agents.

    from revive import Engine, Provider, CheckpointStore, Step

When a long-running agent's OAuth *refresh token* dies mid-run, Revive
classifies the death, durably checkpoints the exact step, opens an out-of-band
re-consent rendezvous, rotates the credential lease, and resumes the same
logical run. The worker process may be different.

Re-consent for a dead token is one `Kind` of rendezvous; human approval / step-up
/ missing-input use the identical park-route-resume path (the Parley platform).
"""
from .checkpoint import Checkpoint, CheckpointStore
from .classifier import ClassifierResult, Verdict, classify
from .engine import (AmbiguousSideEffect, Completed, Engine, NeedsApproval,
                     Parked, StaleCredentialGeneration, Step, StepContext,
                     WrongRecoveryIdentity)
from .providers import AuthError, Provider, Token, TokenError
from .rendezvous import Kind, Rendezvous, console_channel, webhook_channel
from .postgres import PostgresCheckpointStore
from .reporter import Reporter

__all__ = [
    "Engine", "Step", "StepContext", "Parked", "Completed", "NeedsApproval",
    "AmbiguousSideEffect",
    "WrongRecoveryIdentity", "StaleCredentialGeneration",
    "Provider", "Token", "TokenError", "AuthError",
    "CheckpointStore", "Checkpoint",
    "PostgresCheckpointStore",
    "Reporter",
    "classify", "ClassifierResult", "Verdict",
    "Rendezvous", "Kind", "console_channel", "webhook_channel",
]
__version__ = "0.1.0"
