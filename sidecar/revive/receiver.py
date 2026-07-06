"""Resume receiver — the runtime side of dead-reauth-resume.

When a workspace registers a resume endpoint (POST /v1/workspace/resume-endpoint),
the control plane delivers a signed ``recovery.resume_requested`` event there the
moment a recovery case reaches ``identity_verified``. This module is the
reference implementation of that endpoint: it verifies the HMAC signature,
deduplicates retries, invokes your resume handler exactly once per event, and
returns the acknowledgement the control plane requires before it transitions
the case to ``resumed``.

Stdlib-only, like the rest of the core SDK. Use it three ways:

1. Standalone server (zero dependencies)::

       from revive.receiver import ResumeReceiver, serve

       def resume(data):
           # splice the rotated credential and continue the parked run
           graph.invoke(Command(resume={"connection_id": data["connectionId"],
                                        "lease_generation": data["generation"]}),
                        {"configurable": {"thread_id": data["runId"]}})

       serve(ResumeReceiver(secret=os.environ["REVIVE_RESUME_SECRET"], resume=resume),
             port=8752)

2. Inside any framework — call ``receiver.handle(headers, body)`` from a FastAPI
   or Flask route and relay the (status, response) pair.

3. Just the crypto — ``verify_signature`` for hand-rolled receivers (see
   examples/resume_receiver_express.js for the Node equivalent).

Wire protocol (mirrors lib/webhooks.ts on the control plane):

- headers: ``webhook-id``, ``webhook-timestamp`` (unix seconds),
  ``webhook-signature`` (``v1,<hmac-sha256-hex>``), ``idempotency-key``
- signed message: ``{webhook-id}.{webhook-timestamp}.{raw-body}``
- required acknowledgement for ``recovery.resume_requested``::

      {"ok": true, "resumed": true, "runId": ..., "checkpointId": ...}

The control plane retries delivery (up to 8 attempts) until it receives that
acknowledgement, then transitions the case identity_verified -> resumed.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable, Mapping, Optional, Tuple


def verify_signature(secret: str, signature: str, webhook_id: str, timestamp: str,
                     body: bytes, tolerance_seconds: int = 300) -> bool:
    """Constant-time check of a ``v1,<hex>`` signature over ``id.timestamp.body``.

    Rejects timestamps outside ``tolerance_seconds`` to stop replay of captured
    deliveries. All inputs come straight from the request; nothing is parsed
    before the signature is verified.
    """
    try:
        seconds = float(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(time.time() - seconds) > tolerance_seconds:
        return False
    signed = f"{webhook_id}.{timestamp}.".encode() + body
    expected = "v1," + hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature or "", expected)


ResumeHandler = Callable[[dict], Optional[dict]]


class ResumeReceiver:
    """Verifies, deduplicates, and dispatches control-plane resume callbacks.

    ``resume(data)`` receives the event's ``data`` dict (caseId, workspaceId,
    runId, checkpointId, connectionId, actionKey, idempotencyKey, generation)
    and must return once the run has actually resumed — the acknowledgement this
    receiver sends is the control plane's signal to mark the case ``resumed``.
    Raise to signal failure; the control plane will retry with the same
    ``webhook-id``, and the retry is served from the dedup cache only after a
    prior success.
    """

    def __init__(self, secret: str, resume: ResumeHandler, tolerance_seconds: int = 300):
        if not secret:
            raise ValueError("a shared secret is required")
        self.secret = secret
        self.resume = resume
        self.tolerance_seconds = tolerance_seconds
        self._acked: dict[str, dict] = {}
        self._lock = threading.Lock()

    def handle(self, headers: Mapping[str, str], body: bytes) -> Tuple[int, dict]:
        """Process one delivery; returns (http_status, response_json)."""
        lowered = {str(k).lower(): v for k, v in headers.items()}
        webhook_id = lowered.get("webhook-id", "")
        timestamp = lowered.get("webhook-timestamp", "")
        signature = lowered.get("webhook-signature", "")
        if not verify_signature(self.secret, signature, webhook_id, timestamp, body,
                                self.tolerance_seconds):
            return 401, {"ok": False, "error": "invalid signature"}
        try:
            event = json.loads(body)
        except json.JSONDecodeError:
            return 400, {"ok": False, "error": "invalid JSON"}

        kind = event.get("type")
        if kind == "recovery.resume_test":
            return 200, {"ok": True, "test": True}
        if kind != "recovery.resume_requested":
            # Acknowledge receipt without acting so unknown event types added
            # later never wedge the delivery queue.
            return 200, {"ok": True, "ignored": kind}

        with self._lock:
            if webhook_id in self._acked:
                return 200, self._acked[webhook_id]

        data = event.get("data") or {}
        try:
            extra = self.resume(data) or {}
        except Exception as error:  # noqa: BLE001 — surfaced to the retrying caller
            return 500, {"ok": False, "error": str(error)}
        ack = {
            "ok": True,
            "resumed": True,
            "runId": data.get("runId"),
            "checkpointId": data.get("checkpointId"),
            **extra,
        }
        with self._lock:
            self._acked[webhook_id] = ack
        return 200, ack


def serve(receiver: ResumeReceiver, port: int, host: str = "127.0.0.1") -> ThreadingHTTPServer:
    """Run the receiver on a background stdlib HTTP server; returns the server.

    Call ``.shutdown()`` to stop. For production, front this with TLS (the
    control plane refuses non-HTTPS endpoints outside local development).
    """

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802 — http.server contract
            length = int(self.headers.get("content-length") or 0)
            body = self.rfile.read(length)
            status, response = receiver.handle(self.headers, body)
            payload = json.dumps(response).encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):  # keep example output clean
            pass

    httpd = ThreadingHTTPServer((host, port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd
