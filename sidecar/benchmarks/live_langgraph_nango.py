#!/usr/bin/env python3
"""Live Revive certification: LangGraph + Nango + Microsoft Graph.

This is deliberately a correctness certification, not a load benchmark. It:
1. verifies a live Nango-backed Microsoft Graph connection;
2. injects a credential-unavailable recovery interrupt;
3. resumes the same durable LangGraph thread with an opaque connection ID;
4. creates one real Microsoft Graph draft;
5. injects transport loss after Graph accepted the write;
6. retries the node, reconciles upstream, and proves no duplicate write;
7. deletes the certification draft after recording the result.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import NotRequired, TypedDict

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


ROOT = Path(__file__).resolve().parents[2]
STATE_DIR = ROOT / ".revive"
CHECKPOINT_DB = STATE_DIR / "langgraph-live-certification.db"
LEDGER_DB = STATE_DIR / "langgraph-live-ledger.db"
RESULT_FILE = ROOT / "benchmarks" / "results" / "revive-certification-live.json"


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


class CertificationState(TypedDict):
    run_id: str
    subject: str
    connection_id: NotRequired[str]
    lease_generation: NotRequired[int]
    status: NotRequired[str]
    draft_id: NotRequired[str]
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
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        payload = json.loads(raw) if raw else None
        raise RuntimeError(f"Nango proxy {method} {path} failed with {error.code}: {payload}") from error


def ledger() -> sqlite3.Connection:
    connection = sqlite3.connect(LEDGER_DB)
    connection.execute(
        """create table if not exists certification_actions (
            action_id text primary key,
            state text not null,
            mutation_calls integer not null default 0,
            transport_loss_injected integer not null default 0,
            remote_id text,
            updated_at real not null
        )"""
    )
    return connection


def draft_matches(subject: str) -> list[dict]:
    query = urllib.parse.urlencode({"$select": "id,subject", "$top": "100"})
    status, payload = proxy("GET", f"/v1.0/me/mailFolders/drafts/messages?{query}")
    if status != 200 or not isinstance(payload, dict):
        raise RuntimeError("Microsoft Graph did not return the draft collection")
    return [item for item in payload.get("value", []) if item.get("subject") == subject]


def protected_draft(state: CertificationState) -> dict:
    recovery = interrupt({
        "kind": "credential_recovery",
        "provider": "microsoft",
        "reason": "controlled credential-unavailable injection after live Graph preflight",
        "run_id": state["run_id"],
    })
    if not isinstance(recovery, dict) or recovery.get("connection_id") != CONNECTION_ID:
        raise RuntimeError("resume payload did not contain the bound Nango connection")
    generation = int(recovery.get("lease_generation") or 0)
    if generation < 2:
        raise RuntimeError("credential lease generation did not advance")

    action_id = f"{state['run_id']}:create-draft"
    with ledger() as db:
        row = db.execute(
            "select state, mutation_calls, transport_loss_injected, remote_id from certification_actions where action_id = ?",
            (action_id,),
        ).fetchone()
        if row and row[0] == "started":
            matches = draft_matches(state["subject"])
            if len(matches) != 1:
                raise RuntimeError(f"reconciliation expected one draft, found {len(matches)}")
            draft_id = str(matches[0]["id"])
            db.execute(
                "update certification_actions set state = 'reconciled', remote_id = ?, updated_at = ? where action_id = ?",
                (draft_id, time.time(), action_id),
            )
            return {
                "connection_id": CONNECTION_ID,
                "lease_generation": generation,
                "status": "completed",
                "draft_id": draft_id,
                "reconciled": True,
            }

        db.execute(
            "insert or replace into certification_actions (action_id, state, mutation_calls, transport_loss_injected, updated_at) values (?, 'started', 0, 0, ?)",
            (action_id, time.time()),
        )
        status, created = proxy("POST", "/v1.0/me/messages", {
            "subject": state["subject"],
            "body": {"contentType": "Text", "content": "Temporary Revive live recovery certification draft. Safe to delete."},
        })
        if status != 201 or not isinstance(created, dict) or not created.get("id"):
            raise RuntimeError("Microsoft Graph did not accept the certification draft")
        db.execute(
            "update certification_actions set mutation_calls = mutation_calls + 1, transport_loss_injected = 1, updated_at = ? where action_id = ?",
            (time.time(), action_id),
        )
    raise SimulatedTransportLoss("controlled loss after Graph returned 201; response intentionally discarded")


def source_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    except Exception:
        return "unknown"


def main() -> int:
    if not NANGO_SECRET or not CONNECTION_ID:
        print("NANGO_SECRET_KEY and NANGO_CERT_CONNECTION_ID are required", file=sys.stderr)
        return 2
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_FILE.parent.mkdir(parents=True, exist_ok=True)
    run_id = f"live-cert-{uuid.uuid4().hex[:12]}"
    subject = f"Revive live certification {run_id}"
    started = time.perf_counter()
    cleanup = {"attempted": False, "succeeded": False}
    result: dict = {
        "schemaVersion": 1,
        "kind": "live-provider-correctness-certification",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCommit": source_commit(),
        "runtime": {"name": "LangGraph", "checkpointer": "SQLiteSaver", "threadId": run_id},
        "credentialSystem": {"name": "Nango", "integrationId": INTEGRATION_ID, "connectionHash": hashlib.sha256(CONNECTION_ID.encode()).hexdigest()[:16]},
        "provider": {"name": "Microsoft Graph", "operation": "create draft"},
        "failureInjection": {
            "credential": "controlled credential-unavailable interrupt after live Graph preflight",
            "sideEffect": "controlled transport loss after Graph returned HTTP 201",
        },
        "claimsExcluded": ["provider-wide recovery rate", "availability", "throughput", "customer MTTR"],
    }
    draft_id = None
    try:
        preflight_status, preflight = proxy("GET", "/v1.0/me?$select=id,userPrincipalName")
        if preflight_status != 200 or not isinstance(preflight, dict) or not preflight.get("id"):
            raise RuntimeError("live Microsoft Graph preflight failed")

        builder = StateGraph(CertificationState)
        builder.add_node("protected_draft", protected_draft)
        builder.add_edge(START, "protected_draft")
        builder.add_edge("protected_draft", END)
        with SqliteSaver.from_conn_string(str(CHECKPOINT_DB)) as saver:
            graph = builder.compile(checkpointer=saver)
            config = {"configurable": {"thread_id": run_id}}
            first = graph.invoke({"run_id": run_id, "subject": subject}, config=config)
            interrupts = first.get("__interrupt__", [])
            if len(interrupts) != 1:
                raise RuntimeError("LangGraph did not durably park on one recovery interrupt")
            try:
                graph.invoke(Command(resume={"connection_id": CONNECTION_ID, "lease_generation": 2}), config=config)
                raise RuntimeError("transport-loss injection did not execute")
            except SimulatedTransportLoss:
                pass
            final = graph.invoke(None, config=config)

        draft_id = final.get("draft_id")
        matches = draft_matches(subject)
        with ledger() as db:
            ledger_row = db.execute(
                "select state, mutation_calls, transport_loss_injected from certification_actions where action_id = ?",
                (f"{run_id}:create-draft",),
            ).fetchone()
        assertions = {
            "sameThreadResumed": final.get("status") == "completed",
            "leaseGenerationAdvanced": final.get("lease_generation") == 2,
            "sideEffectReconciled": final.get("reconciled") is True,
            "singleMutationCall": bool(ledger_row and ledger_row[1] == 1),
            "singleRemoteDraft": len(matches) == 1,
            "transportLossInjected": bool(ledger_row and ledger_row[2] == 1),
        }
        passed = all(assertions.values())
        result.update({
            "passed": passed,
            "durationMs": round((time.perf_counter() - started) * 1000, 3),
            "assertions": assertions,
            "observed": {"mutationCalls": ledger_row[1] if ledger_row else None, "remoteDraftCount": len(matches), "finalGeneration": final.get("lease_generation")},
        })
        return_code = 0 if passed else 1
    except Exception as error:
        result.update({"passed": False, "durationMs": round((time.perf_counter() - started) * 1000, 3), "error": str(error)})
        return_code = 1
    finally:
        if draft_id:
            cleanup["attempted"] = True
            try:
                cleanup_status, _ = proxy("DELETE", f"/v1.0/me/messages/{urllib.parse.quote(str(draft_id), safe='')}")
                cleanup["succeeded"] = cleanup_status == 204
            except Exception as error:
                cleanup["error"] = str(error)
        result["cleanup"] = cleanup
        RESULT_FILE.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({"passed": result.get("passed"), "result": str(RESULT_FILE), "cleanup": cleanup}))
    return return_code


if __name__ == "__main__":
    raise SystemExit(main())
