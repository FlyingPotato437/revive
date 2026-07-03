#!/usr/bin/env python3
"""Interactive Revive demo with LangGraph, Nango, and Microsoft Graph.

The demo performs real reads, parks one durable LangGraph thread, opens a real
Revive recovery case, waits for Nango reauthorization, then receives Revive's
signed runtime callback. After resume it creates and sends one message, injects
transport loss after Graph returns 202, reconciles Sent Items, and proves that
the send endpoint was called once.

This sends a temporary message to REVIVE_DEMO_RECIPIENT. Use an account you own.
The script deletes matching Sent Items and Inbox copies after verification.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import NotRequired, TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


ROOT = Path(__file__).resolve().parents[2]
STATE_DIR = ROOT / ".revive"
CHECKPOINT_DB = STATE_DIR / "langgraph-killer-demo.db"
LEDGER_DB = STATE_DIR / "langgraph-killer-ledger.db"
RESULT_FILE = ROOT / "benchmarks" / "results" / "revive-killer-demo-live.json"


def load_env() -> None:
    path = ROOT / ".env.local"
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key, value.strip().strip('"').strip("'"))


load_env()
NANGO_SECRET = os.environ.get("NANGO_SECRET_KEY", "")
CONNECTION_ID = os.environ.get("NANGO_CERT_CONNECTION_ID", "")
INTEGRATION_ID = os.environ.get("NANGO_CERT_INTEGRATION_ID", "microsoft-tenant-specific")
NANGO_URL = os.environ.get("NANGO_BASE_URL", "https://api.nango.dev").rstrip("/")
REVIVE_URL = os.environ.get("REVIVE_BASE_URL", "http://localhost:3000").rstrip("/")
REVIVE_API_KEY = os.environ.get("REVIVE_API_KEY", "")
WORKER_SECRET = os.environ.get("REVIVE_WORKER_SECRET", "")
CALLBACK_SECRET = os.environ.get("REVIVE_RUNTIME_RESUME_SECRET", "")
CALLBACK_HOST = os.environ.get("REVIVE_RUNTIME_CALLBACK_HOST", "127.0.0.1")
CALLBACK_PORT = int(os.environ.get("REVIVE_RUNTIME_CALLBACK_PORT", "8788"))
RECIPIENT = os.environ.get("REVIVE_DEMO_RECIPIENT", "")


class DemoState(TypedDict):
    run_id: str
    checkpoint_ref: str
    subject: str
    recipient: str
    account_id: NotRequired[str]
    calendar_events: NotRequired[int]
    connection_id: NotRequired[str]
    lease_generation: NotRequired[int]
    action_id: NotRequired[str]
    remote_id: NotRequired[str]
    status: NotRequired[str]
    reconciled: NotRequired[bool]


class SimulatedTransportLoss(RuntimeError):
    pass


def proxy(method: str, path: str, body: dict | None = None) -> tuple[int, dict | None]:
    request = urllib.request.Request(
        f"{NANGO_URL}/proxy{path}",
        method=method,
        headers={
            "Authorization": f"Bearer {NANGO_SECRET}",
            "Provider-Config-Key": INTEGRATION_ID,
            "Connection-Id": CONNECTION_ID,
            "Content-Type": "application/json",
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        payload = json.loads(raw) if raw else None
        raise RuntimeError(f"Nango proxy {method} {path} failed with {error.code}: {payload}") from error


def revive(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    request = urllib.request.Request(
        f"{REVIVE_URL}{path}",
        method=method,
        headers={"Authorization": f"Bearer {REVIVE_API_KEY}", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read()
        payload = json.loads(raw) if raw else {}
        return error.code, payload


def demo_ledger() -> sqlite3.Connection:
    db = sqlite3.connect(LEDGER_DB)
    db.execute(
        """create table if not exists killer_actions (
            action_key text primary key,
            send_calls integer not null default 0,
            draft_id text,
            state text not null,
            updated_at real not null
        )"""
    )
    return db


def inspect_identity(state: DemoState) -> dict:
    status, profile = proxy("GET", "/v1.0/me?$select=id,userPrincipalName,mail")
    if status != 200 or not isinstance(profile, dict) or not profile.get("id"):
        raise RuntimeError("Graph identity read failed")
    return {"account_id": profile.get("mail") or profile.get("userPrincipalName") or profile["id"]}


def inspect_calendar(_: DemoState) -> dict:
    now = datetime.now(timezone.utc)
    query = urllib.parse.urlencode({
        "startDateTime": now.isoformat(),
        "endDateTime": (now + timedelta(days=1)).isoformat(),
        "$select": "id",
        "$top": "10",
    })
    status, payload = proxy("GET", f"/v1.0/me/calendarView?{query}")
    if status != 200 or not isinstance(payload, dict):
        raise RuntimeError("Graph calendar read failed")
    return {"calendar_events": len(payload.get("value", []))}


def wait_for_sent_reconciliation(action_id: str, subject: str) -> dict:
    for _ in range(20):
        status, result = revive("POST", f"/v1/actions/{action_id}/reconcile-graph", {
            "integrationId": INTEGRATION_ID,
            "subject": subject,
            "windowMinutes": 30,
        })
        if status == 200 and result.get("outcome") == "committed":
            return result
        if status != 200 or result.get("outcome") == "unknown":
            raise RuntimeError(f"Graph reconciliation could not prove the send: {result}")
        time.sleep(1.5)
    raise RuntimeError("sent message did not become visible inside the reconciliation window")


def protected_send(state: DemoState) -> dict:
    recovery = interrupt({
        "kind": "credential_recovery",
        "provider": "microsoft",
        "reason": "credential grant rejected after profile and calendar reads",
        "run_id": state["run_id"],
        "checkpoint_id": state["checkpoint_ref"],
    })
    if not isinstance(recovery, dict) or recovery.get("connection_id") != CONNECTION_ID:
        raise RuntimeError("runtime callback supplied the wrong connection")
    generation = int(recovery.get("lease_generation") or 0)
    if generation < 2:
        raise RuntimeError("runtime callback did not advance the credential generation")

    status, action = revive("POST", "/v1/actions", {
        "runId": state["run_id"],
        "checkpointId": state["checkpoint_ref"],
        "connectionId": CONNECTION_ID,
        "actionKey": "sendMail",
        "idempotencyKey": f"{state['run_id']}:sendMail",
        "leaseGeneration": generation,
    })
    if status != 200:
        raise RuntimeError(f"action registration failed: {action}")
    action_id = str(action["id"])
    if action.get("replayVerdict") == "already_committed":
        return {"status": "completed", "action_id": action_id, "reconciled": True,
                "connection_id": CONNECTION_ID, "lease_generation": generation}
    if action.get("replayVerdict") == "reconcile_first":
        result = wait_for_sent_reconciliation(action_id, state["subject"])
        return {
            "status": "completed",
            "action_id": action_id,
            "remote_id": result.get("remoteId"),
            "reconciled": True,
            "connection_id": CONNECTION_ID,
            "lease_generation": generation,
        }

    started_status, started = revive("POST", f"/v1/actions/{action_id}/started", {})
    if started_status != 200:
        raise RuntimeError(f"action could not enter started state: {started}")
    draft_status, draft = proxy("POST", "/v1.0/me/messages", {
        "subject": state["subject"],
        "body": {
            "contentType": "Text",
            "content": "Revive live recovery demo. This temporary message proves one safe send after credential recovery.",
        },
        "toRecipients": [{"emailAddress": {"address": state["recipient"]}}],
        "internetMessageHeaders": [{"name": "x-revive-run-id", "value": state["run_id"]}],
    })
    if draft_status != 201 or not isinstance(draft, dict) or not draft.get("id"):
        raise RuntimeError("Graph did not create the protected draft")
    draft_id = str(draft["id"])
    send_status, _ = proxy("POST", f"/v1.0/me/messages/{urllib.parse.quote(draft_id, safe='')}/send")
    # Graph answers 202; the Nango proxy re-wraps the empty accepted response
    # as 200. Both mean the send was accepted.
    if send_status not in (200, 202):
        raise RuntimeError(f"Graph send returned {send_status}, expected 200/202")
    with demo_ledger() as db:
        db.execute(
            "insert into killer_actions (action_key, send_calls, draft_id, state, updated_at) values (?, 1, ?, 'uncertain', ?) "
            "on conflict(action_key) do update set send_calls = killer_actions.send_calls + 1, draft_id = excluded.draft_id, state = 'uncertain', updated_at = excluded.updated_at",
            (f"{state['run_id']}:sendMail", draft_id, time.time()),
        )
    raise SimulatedTransportLoss("controlled loss after Graph accepted the send")


def build_graph(saver: SqliteSaver):
    builder = StateGraph(DemoState)
    builder.add_node("identity", inspect_identity)
    builder.add_node("calendar", inspect_calendar)
    builder.add_node("protected_send", protected_send)
    builder.add_edge(START, "identity")
    builder.add_edge("identity", "calendar")
    builder.add_edge("calendar", "protected_send")
    builder.add_edge("protected_send", END)
    return builder.compile(checkpointer=saver)


def verify_callback(headers, body: bytes) -> bool:
    event_id = headers.get("webhook-id", "")
    timestamp = headers.get("webhook-timestamp", "")
    signature = headers.get("webhook-signature", "")
    try:
        if abs(time.time() - int(timestamp)) > 300:
            return False
    except ValueError:
        return False
    digest = hmac.new(CALLBACK_SECRET.encode(), f"{event_id}.{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, f"v1,{digest}")


def delete_matching_messages(subject: str) -> dict:
    deleted = 0
    errors: list[str] = []
    for folder in ("sentitems", "inbox", "drafts"):
        filter_value = urllib.parse.quote(f"subject eq '{subject.replace(chr(39), chr(39) * 2)}'", safe="")
        try:
            _, payload = proxy("GET", f"/v1.0/me/mailFolders/{folder}/messages?$filter={filter_value}&$select=id&$top=10")
            for message in (payload or {}).get("value", []):
                try:
                    status, _ = proxy("DELETE", f"/v1.0/me/messages/{urllib.parse.quote(str(message['id']), safe='')}")
                    if status == 204:
                        deleted += 1
                except Exception as error:
                    errors.append(str(error))
        except Exception as error:
            errors.append(str(error))
    return {"attempted": True, "deleted": deleted, "errors": errors}


def main() -> int:
    required = {
        "NANGO_SECRET_KEY": NANGO_SECRET,
        "NANGO_CERT_CONNECTION_ID": CONNECTION_ID,
        "REVIVE_API_KEY": REVIVE_API_KEY,
        "REVIVE_RUNTIME_RESUME_SECRET": CALLBACK_SECRET,
        "REVIVE_DEMO_RECIPIENT": RECIPIENT,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        print(f"Missing required environment: {', '.join(missing)}", file=sys.stderr)
        return 2

    STATE_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_FILE.parent.mkdir(parents=True, exist_ok=True)
    run_id = f"killer-{uuid.uuid4().hex[:12]}"
    checkpoint_id = f"langgraph:{run_id}:protected_send"
    subject = f"Revive recovery proof {run_id}"
    initial_state: DemoState = {
        "run_id": run_id,
        "checkpoint_ref": checkpoint_id,
        "subject": subject,
        "recipient": RECIPIENT,
    }
    finished = threading.Event()
    outcome: dict = {}
    started_at = time.perf_counter()

    with SqliteSaver.from_conn_string(str(CHECKPOINT_DB)) as saver:
        graph = build_graph(saver)
        config = {"configurable": {"thread_id": run_id}}
        first = graph.invoke(initial_state, config=config)
        if len(first.get("__interrupt__", [])) != 1:
            raise RuntimeError("LangGraph did not park at the send boundary")
        status, recovery_case = revive("POST", "/v1/recovery-cases", {
            "runId": run_id,
            "checkpointId": checkpoint_id,
            "connectionId": CONNECTION_ID,
            "actionKey": "sendMail",
            "idempotencyKey": f"{run_id}:sendMail",
            "provider": "microsoft",
            "policy": "interactive_reauth",
            "reason": "invalid_grant: Microsoft connection revoked during the run",
            "leaseGeneration": 1,
            "mutationDispatched": False,
        })
        if status != 200 or not recovery_case.get("url"):
            raise RuntimeError(f"Revive did not open the recovery case: {recovery_case}")

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                if self.path != "/revive/resume":
                    self.send_error(404)
                    return
                body = self.rfile.read(int(self.headers.get("content-length", "0")))
                if not verify_callback(self.headers, body):
                    self.send_error(401)
                    return
                try:
                    event = json.loads(body)
                    data = event["data"]
                    if data.get("runId") != run_id or data.get("checkpointId") != checkpoint_id:
                        raise RuntimeError("callback did not match this run and checkpoint")
                    resume = {"connection_id": data["connectionId"], "lease_generation": data["generation"]}
                    try:
                        graph.invoke(Command(resume=resume), config=config)
                        raise RuntimeError("transport-loss injection did not run")
                    except SimulatedTransportLoss:
                        pass
                    final = graph.invoke(None, config=config)
                    with demo_ledger() as db:
                        row = db.execute(
                            "select send_calls from killer_actions where action_key = ?",
                            (f"{run_id}:sendMail",),
                        ).fetchone()
                    assertions = {
                        "sameThreadResumed": final.get("status") == "completed",
                        "leaseGenerationAdvanced": final.get("lease_generation") == 2,
                        "sideEffectReconciled": final.get("reconciled") is True,
                        "singleSendCall": bool(row and row[0] == 1),
                    }
                    outcome.update({"passed": all(assertions.values()), "assertions": assertions, "final": final})
                    payload = {"ok": True, "resumed": True, "runId": run_id, "checkpointId": checkpoint_id}
                    encoded = json.dumps(payload).encode()
                    self.send_response(200)
                    self.send_header("content-type", "application/json")
                    self.send_header("content-length", str(len(encoded)))
                    self.end_headers()
                    self.wfile.write(encoded)
                except Exception as error:
                    outcome.update({"passed": False, "error": str(error)})
                    self.send_error(500)
                finally:
                    finished.set()

            def log_message(self, format, *args):  # noqa: A003
                return

        server = ThreadingHTTPServer((CALLBACK_HOST, CALLBACK_PORT), CallbackHandler)

        def drain_queue() -> None:
            if not WORKER_SECRET:
                return
            while not finished.is_set():
                request = urllib.request.Request(
                    f"{REVIVE_URL}/api/internal/jobs/drain?limit=5",
                    method="POST",
                    headers={"Authorization": f"Bearer {WORKER_SECRET}", "x-revive-worker-id": "killer-demo"},
                )
                try:
                    urllib.request.urlopen(request, timeout=30).read()
                except Exception:
                    pass
                finished.wait(1)

        threading.Thread(target=drain_queue, daemon=True).start()
        callback_url = f"http://{CALLBACK_HOST}:{CALLBACK_PORT}/revive/resume"
        recovery_url = urllib.parse.urljoin(f"{REVIVE_URL}/", str(recovery_case["url"]).lstrip("/"))
        print(json.dumps({
            "status": "parked",
            "runId": run_id,
            "completedTools": ["Microsoft Graph profile", "Microsoft Graph calendar"],
            "recoveryUrl": recovery_url,
            "callbackUrl": callback_url,
            "next": "Open recoveryUrl and reconnect the bound Microsoft account.",
        }, indent=2))
        while not finished.is_set():
            server.handle_request()
        server.server_close()

    cleanup = delete_matching_messages(subject) if outcome.get("passed") else {"attempted": False}
    artifact = {
        "schemaVersion": 1,
        "kind": "live-recovery-killer-demo",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "passed": bool(outcome.get("passed")),
        "runtime": {"name": "LangGraph", "threadId": run_id, "checkpointId": checkpoint_id},
        "credentialSystem": {"name": "Nango", "integrationId": INTEGRATION_ID,
                             "connectionHash": hashlib.sha256(CONNECTION_ID.encode()).hexdigest()[:16]},
        "provider": {"name": "Microsoft Graph", "operation": "send existing draft"},
        "failureInjection": "controlled response loss after Graph returned 202 Accepted",
        "durationMs": round((time.perf_counter() - started_at) * 1000, 3),
        "assertions": outcome.get("assertions", {}),
        "error": outcome.get("error"),
        "cleanup": cleanup,
        "claimsExcluded": ["provider-wide success rate", "availability", "customer MTTR"],
    }
    RESULT_FILE.write_text(json.dumps(artifact, indent=2) + "\n")
    print(json.dumps({"passed": artifact["passed"], "result": str(RESULT_FILE), "cleanup": cleanup}))
    return 0 if artifact["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
