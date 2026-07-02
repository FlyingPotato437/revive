"""LangGraph adapter.

LangGraph already ships durable checkpointing and `interrupt()` / `Command(resume=)`
for human-in-the-loop. What it lacks is the auth-death TRIGGER and the re-consent
+ credential rotation. This adapter supplies that trigger, reusing LangGraph's own durable
pause/resume — so an existing LangGraph agent gains dead-reauth-resume with a
single call inside its nodes.

    from revive.adapters.langgraph import revive_refresh

    def files_node(state):
        try:
            data = call_graph_api(state["access_token"])
        except Unauthorized:
            tok = revive_refresh(provider, state["refresh_token"], SCOPES)  # pauses if dead
            state.update(access_token=tok.access_token, refresh_token=tok.refresh_token)
            data = call_graph_api(tok.access_token)
        ...

When the refresh token is dead, `revive_refresh` calls LangGraph's `interrupt()`,
which durably parks the run via the configured checkpointer. The driver routes
the re-consent and resumes with `Command(resume={"refresh_token": <new>})`; the
node re-executes, `interrupt()` returns that payload, and the fresh credential
generation is used by the same logical thread.
"""
from __future__ import annotations

from ..classifier import ClassifierResult, classify
from ..providers import Provider, Token, TokenError

try:
    from langgraph.types import interrupt  # type: ignore
    HAS_LANGGRAPH = True
except Exception:  # pragma: no cover - optional dependency
    HAS_LANGGRAPH = False

    def interrupt(value):  # type: ignore
        raise RuntimeError("langgraph is not installed: pip install langgraph")


def reconsent_payload(result: ClassifierResult, scopes) -> dict:
    return {
        "kind": "reconsent",
        "code": result.code,
        "title": result.title,
        "reason": result.reason,
        "remediation": result.remediation,
        "scopes": list(scopes),
        "confidence": result.confidence,
    }


def revive_refresh(provider: Provider, refresh_token: str, scopes=(),
                   credential_resolver=None) -> Token:
    """Refresh; on a truly-dead refresh token, durably pause for re-consent and
    resume with the rotated credential. A still-refreshable error refreshes
    silently; a transient error is re-raised for the framework's retry policy.

    Resume payload contract — the Command payload is persisted in LangGraph's
    checkpoint history, so it must stay OPAQUE:

        Command(resume={"connection_id": "...", "lease_generation": 2})

    `credential_resolver(connection_id, lease_generation)` is supplied by the
    host process and returns the refresh token from the credential store; the
    raw token never enters workflow history. Passing a raw ``refresh_token`` in
    the resume payload is supported for local sandbox drills only.
    """
    try:
        return provider.refresh(refresh_token)
    except TokenError as te:
        result = classify(te.payload)
        if not result.needs_human:
            raise
        # durable pause via LangGraph's checkpointer
        reply = interrupt(reconsent_payload(result, scopes))
        if isinstance(reply, dict) and reply.get("connection_id"):
            if credential_resolver is None:
                raise RuntimeError(
                    "resume payload references a connection, but no "
                    "credential_resolver was configured"
                )
            new_refresh = credential_resolver(
                reply["connection_id"], int(reply.get("lease_generation") or 1)
            )
        else:
            # Sandbox-only fallback: raw token in the resume payload.
            new_refresh = reply["refresh_token"] if isinstance(reply, dict) else reply
        return provider.refresh(new_refresh)
