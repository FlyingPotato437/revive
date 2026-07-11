"""Python client for the hosted Revive control plane (/v1 contract).

Mirrors the TypeScript SDK: register -> verdict gate -> started -> execute ->
complete, with recovery-case parking on credential failure. Used by the
OpenAI Agents and Anthropic adapters; usable directly for any tool call.
"""

from __future__ import annotations

import hashlib
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable, Optional


class AmbiguousCommitError(RuntimeError):
    """A previous attempt may have committed; reconcile before replaying."""


@dataclass
class ParkedRun:
    case_id: str
    recovery_url: Optional[str]
    reason: str


class ReviveParkedError(RuntimeError):
    """The credential is dead; a recovery case was opened."""

    def __init__(self, parked: ParkedRun):
        super().__init__(f"run parked: {parked.reason} (case {parked.case_id})")
        self.parked = parked


def idempotency_key(run_id: str, action_key: str, checkpoint_id: str = "checkpoint") -> str:
    digest = hashlib.sha256(f"{run_id}:{checkpoint_id}:{action_key}".encode()).digest()
    import base64

    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


class ReviveClient:
    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _request(self, method: str, path: str, body: Optional[dict] = None) -> tuple[int, dict]:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={
                "authorization": f"Bearer {self.api_key}",
                "content-type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status, json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            try:
                return error.code, json.loads(error.read() or b"{}")
            except json.JSONDecodeError:
                return error.code, {}

    def detect_dead_run(
        self,
        *,
        run_id: str,
        failure_message: str,
        checkpoint_id: Optional[str] = None,
        generation: int = 1,
        idem_key: Optional[str] = None,
        runtime: str = "custom",
        trace: Any = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        estimated_cost_usd: float = 0,
    ) -> dict:
        """Record a terminal run at an existing interrupt boundary.

        The server redacts the trace before classification or durable storage.
        Detection never contacts an end user and is safe to install first.
        """
        key = idem_key or idempotency_key(run_id, f"dead-run:{runtime}", checkpoint_id or "checkpoint")
        payload: dict[str, Any] = {
            "runId": run_id,
            "generation": generation,
            "idempotencyKey": key,
            "runtime": runtime,
            "failureMessage": failure_message,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "estimatedCostUsd": estimated_cost_usd,
        }
        if checkpoint_id:
            payload["checkpointId"] = checkpoint_id
        if trace is not None:
            payload["trace"] = trace
        status, response = self._request("POST", "/v1/dead-runs", payload)
        if status not in (200, 201):
            raise RuntimeError(f"dead-run detection failed ({status}): {response}")
        return dict(response.get("run") or response)

    def dead_run_stats(self, days: int = 7) -> dict:
        safe_days = max(1, min(365, int(days)))
        status, response = self._request("GET", f"/v1/dead-runs/stats?days={safe_days}")
        if status != 200:
            raise RuntimeError(f"dead-run stats failed ({status}): {response}")
        return dict(response.get("stats") or response)

    def revive_dead_run(
        self,
        dead_run_id: str,
        *,
        recipient: dict,
        destination_url: Optional[str] = None,
        expires_in: str = "48h",
    ) -> dict:
        """Create the secure human action for one classified dead run."""
        payload: dict[str, Any] = {"recipient": recipient, "expiresIn": expires_in}
        if destination_url:
            payload["destinationUrl"] = destination_url
        status, response = self._request("POST", f"/v1/dead-runs/{dead_run_id}/revive", payload)
        if status not in (200, 201):
            raise RuntimeError(f"dead-run resolution failed ({status}): {response}")
        return response

    def protect_action(
        self,
        *,
        run_id: str,
        connection_id: str,
        action_key: str,
        execute: Callable[[], Any],
        checkpoint_id: Optional[str] = None,
        idem_key: Optional[str] = None,
        classify_error: Optional[Callable[[BaseException], Optional[dict]]] = None,
        lease_generation: Optional[int] = None,
    ) -> Any:
        """Run execute() exactly once for this idempotency key.

        already_committed -> stored result returned, execute() skipped
        reconcile_first   -> AmbiguousCommitError (reconcile, then retry)
        credential dead   -> recovery case opened, ReviveParkedError raised
        """
        key = idem_key or idempotency_key(run_id, action_key, checkpoint_id or "checkpoint")
        payload: dict[str, Any] = {
            "runId": run_id,
            "connectionId": connection_id,
            "actionKey": action_key,
            "idempotencyKey": key,
        }
        if checkpoint_id:
            payload["checkpointId"] = checkpoint_id
        if lease_generation is not None:
            payload["leaseGeneration"] = lease_generation
        status, action = self._request("POST", "/v1/actions", payload)
        if status == 409 and action.get("replayVerdict") == "blocked_stale_generation":
            raise ReviveParkedError(ParkedRun(case_id="", recovery_url=None, reason="stale credential generation"))
        if status != 200:
            raise RuntimeError(f"action registration failed ({status}): {action}")
        verdict = action.get("replayVerdict")
        if verdict == "already_committed":
            result_ref = action.get("resultRef")
            try:
                return json.loads(result_ref) if isinstance(result_ref, str) else result_ref
            except json.JSONDecodeError:
                return result_ref
        if verdict == "reconcile_first":
            raise AmbiguousCommitError(action.get("id", ""))

        action_id = str(action["id"])
        self._request("POST", f"/v1/actions/{action_id}/started", {})
        try:
            result = execute()
        except BaseException as error:  # noqa: BLE001 — classification decides
            failure = classify_error(error) if classify_error else None
            if failure is None:
                failure = default_classifier(error)
            if failure is None:
                raise
            _, case = self._request(
                "POST",
                "/v1/recovery-cases",
                {
                    **payload,
                    "provider": failure.get("provider", "microsoft"),
                    "policy": failure.get("policy", "interactive_reauth"),
                    "reason": f"{failure.get('code', 'credential_rejected')}: {failure.get('reason', str(error))[:200]}",
                },
            )
            raise ReviveParkedError(
                ParkedRun(case_id=str(case.get("id", "")), recovery_url=case.get("url"), reason=str(error))
            ) from error
        self._request("POST", f"/v1/actions/{action_id}/complete", {"result": result})
        return result


def default_classifier(error: BaseException) -> Optional[dict]:
    text = str(error).lower()
    if any(marker in text for marker in ("invalid_grant", "aadsts", "token expired", "revoked", "401")):
        return {"code": "credential_rejected", "reason": str(error), "policy": "interactive_reauth"}
    return None
