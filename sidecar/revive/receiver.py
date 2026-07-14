"""Resume receiver — the runtime side of dead-reauth-resume.

When a workspace registers a resume endpoint (POST /v1/workspace/resume-endpoint),
the control plane delivers a signed ``recovery.resume_requested`` event for a
credential recovery or ``action_request.completed`` after a person supplies an
approval or missing value. This module is the reference implementation of that
endpoint: it verifies the HMAC signature, deduplicates retries, invokes your
resume handler once per successful event receipt, and returns the exact
acknowledgement the control plane requires.

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
- required acknowledgement for either continuation event::

      {"ok": true, "resumed": true, "runId": ..., "checkpointId": ...,
       "generation": ...}

The control plane retries delivery until it receives that acknowledgement.
Use ``dedupe_path`` in production and make the underlying checkpoint resume
idempotent; that runtime boundary is what covers a process crash between the
external resume and the local receipt commit.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
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


class _ReceiptStore:
    """Successful callback receipts, optionally durable across worker restarts.

    A receipt is written only after the runtime handler returns successfully.
    If a process dies before that point, the control plane retries and the
    runtime's own run/checkpoint idempotency remains the final safety boundary.
    """

    def __init__(self, path: Optional[str] = None):
        self.path = path
        self._memory: dict[str, dict] = {}
        self._connection: Optional[sqlite3.Connection] = None
        if path:
            directory = os.path.dirname(os.path.abspath(path))
            os.makedirs(directory, mode=0o700, exist_ok=True)
            self._connection = sqlite3.connect(path, check_same_thread=False)
            self._connection.execute("pragma journal_mode = wal")
            self._connection.execute("pragma synchronous = full")
            self._connection.execute(
                """create table if not exists resume_receipts (
                       webhook_id text primary key,
                       response_json text not null,
                       acknowledged_at real not null
                   )"""
            )
            self._connection.commit()

    def get(self, webhook_id: str) -> Optional[dict]:
        if self._connection is None:
            value = self._memory.get(webhook_id)
            return dict(value) if value else None
        row = self._connection.execute(
            "select response_json from resume_receipts where webhook_id = ?",
            (webhook_id,),
        ).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, webhook_id: str, response: dict) -> None:
        if self._connection is None:
            self._memory[webhook_id] = dict(response)
            return
        self._connection.execute(
            "insert or ignore into resume_receipts (webhook_id, response_json, acknowledged_at) values (?, ?, ?)",
            (webhook_id, json.dumps(response, separators=(",", ":")), time.time()),
        )
        self._connection.commit()

    def close(self) -> None:
        if self._connection is not None:
            self._connection.close()
            self._connection = None


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

    def __init__(self, secret: str, resume: ResumeHandler, tolerance_seconds: int = 300,
                 *, dedupe_path: Optional[str] = None):
        if not secret:
            raise ValueError("a shared secret is required")
        self.secret = secret
        self.resume = resume
        self.tolerance_seconds = tolerance_seconds
        self._receipts = _ReceiptStore(dedupe_path or os.environ.get("REVIVE_RECEIVER_DB"))
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
        if kind not in ("recovery.resume_requested", "action_request.completed"):
            # Acknowledge receipt without acting so unknown event types added
            # later never wedge the delivery queue.
            return 200, {"ok": True, "ignored": kind}

        # Serialize the receipt check + handler + receipt write. This prevents
        # simultaneous redeliveries from entering the runtime twice. Durable
        # receipts then extend the same guarantee across successful restarts.
        with self._lock:
            cached = self._receipts.get(webhook_id)
            if cached:
                return 200, cached
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
                "generation": data.get("generation"),
                **extra,
            }
            self._receipts.put(webhook_id, ack)
            return 200, ack

    def close(self) -> None:
        """Close the optional durable receipt store."""
        with self._lock:
            self._receipts.close()


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
