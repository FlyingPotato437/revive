"""Rendezvous — the general "park the run, ask a human out-of-band, resume on
reply" primitive.

Dead-token re-consent is ONE kind of rendezvous. The same engine handles any
out-of-band human input an unattended agent needs:

    auth     — re-consent for a dead refresh token        (Revive, the wedge)
    approval — "approve this $40k wire before I send it"   (Parley, the platform)
    stepup   — "re-authenticate with MFA to continue"
    input    — "I'm missing the PO number; what is it?"

This is the wedge -> platform path made concrete: Revive is `kind="auth"`.
"""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional


class Kind(str, Enum):
    AUTH = "auth"
    APPROVAL = "approval"
    STEPUP = "stepup"
    INPUT = "input"


@dataclass
class Rendezvous:
    id: str
    run_id: str
    kind: Kind
    prompt: str
    url: str
    context: dict[str, Any] = field(default_factory=dict)
    status: str = "open"               # open | answered | expired
    reply: Optional[dict] = None
    created_at: float = field(default_factory=time.time)
    expires_at: float = field(default_factory=lambda: time.time() + 15 * 60)

    @staticmethod
    def new(run_id: str, kind: Kind, prompt: str, base_url: str,
            context: Optional[dict] = None) -> "Rendezvous":
        # 256 bits of entropy; the URL is a short-lived bearer capability.
        rid = "rdv_" + secrets.token_urlsafe(32)
        url = f"{base_url.rstrip('/')}/rendezvous/{rid}"
        return Rendezvous(id=rid, run_id=run_id, kind=kind, prompt=prompt,
                          url=url, context=context or {})

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "run_id": self.run_id,
            "kind": self.kind.value,
            "prompt": self.prompt,
            "url": self.url,
            "context": self.context,
            "status": self.status,
            "reply": self.reply,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
        }


# Delivery channels — where the human is asked. Pluggable; the hosted product
# ships Slack/email/webhook. The console channel is for local dev & demos.
Channel = Callable[[Rendezvous], None]


def console_channel(r: Rendezvous) -> None:
    print(f"  \033[34m↳ re-consent required\033[0m [{r.kind.value}] {r.prompt}")
    print(f"  \033[34m↳ open:\033[0m {r.url}")


def webhook_channel(url: str, secret: Optional[str] = None,
                    max_attempts: int = 1) -> Channel:
    import hashlib
    import hmac
    import json
    import urllib.error
    import urllib.request

    def send(r: Rendezvous) -> None:
        event = {
            "id": "evt_" + r.id, "type": "recovery.parked",
            "created_at": int(time.time()),
            "data": {"id": r.id, "run_id": r.run_id, "kind": r.kind.value,
                     "prompt": r.prompt, "url": r.url, "context": r.context},
        }
        body = json.dumps(event, separators=(",", ":")).encode()
        timestamp = str(int(time.time()))
        headers = {"Content-Type": "application/json", "Webhook-Id": event["id"],
                   "Webhook-Timestamp": timestamp, "Idempotency-Key": event["id"]}
        if secret:
            signed = f'{event["id"]}.{timestamp}.'.encode() + body
            digest = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
            headers["Webhook-Signature"] = "v1," + digest
        last_error = None
        for attempt in range(max(1, max_attempts)):
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=5):
                    return
            except (urllib.error.URLError, TimeoutError) as exc:
                last_error = exc
                if attempt + 1 < max_attempts:
                    time.sleep(min(2 ** attempt, 30))
        if last_error:
            raise last_error

    return send
