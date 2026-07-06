"""LangGraph + registered resume endpoint — the full loop, end to end.

This is the deployment shape design partners wire up:

    control plane                     your runtime (this process)
    ─────────────                     ───────────────────────────
    case: identity_verified   ──►    POST /  (recovery.resume_requested, signed)
                                      verify HMAC → look up parked run
                                      graph.invoke(Command(resume=…), config)
    case: resumed             ◄──    200 {"ok":true,"resumed":true,"runId":…}
    case: completed

One-time registration (replace with your key, URL, and a strong secret):

    curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint \
      -H "authorization: Bearer rv_live_…" -H "content-type: application/json" \
      -d '{"url": "https://agents.example.com/revive/resume", "secret": "…"}'

    # then confirm signature verification round-trips:
    curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint/test \
      -H "authorization: Bearer rv_live_…"

Here the control plane's delivery is simulated byte-for-byte (same headers,
payload, and signature as lib/webhooks.ts deliverRuntimeResumeJob), so the
whole loop runs locally: the LangGraph thread parks on a dead refresh token,
the signed callback arrives, and the SAME thread resumes and finishes.

Run (needs langgraph):  python -m examples.langgraph_resume_endpoint
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import TypedDict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from revive import Provider, AuthError
from revive.adapters.langgraph import revive_refresh
from revive.receiver import ResumeReceiver, serve
from examples.mock_idp import IdP, make_server

IDP_BASE = "http://127.0.0.1:8751"
RECEIVER_PORT = 8752
SHARED_SECRET = "demo-shared-secret-32-bytes-long!!"  # registered with the workspace
SCOPES = ["offline_access", "Mail.ReadWrite", "Mail.Send", "Files.Read.All"]
STEPS = ["acquire", "identity", "inbox", "calendar", "files", "compose", "send", "archive"]
FAILURE_STEP = 4

provider = Provider("microsoft", f"{IDP_BASE}/oauth2/token", scopes=tuple(SCOPES))

# Parked runs this runtime can resume: run_id -> (graph, config). In a real
# deployment this is your checkpointer-backed registry; the run_id in the
# callback is the one you passed when the recovery case was opened.
RUNS: dict[str, tuple] = {}


class State(TypedDict):
    access_token: str
    refresh_token: str
    done: list


def resource_call(access_token: str):
    req = urllib.request.Request(f"{IDP_BASE}/resource",
                                 headers={"Authorization": f"Bearer {access_token}"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise AuthError(json.loads(e.read().decode())) from None
        raise


def resolve_credential(connection_id: str, lease_generation: int) -> str:
    """Fetch the rotated refresh token from the credential store.

    The resume payload stays opaque (connection id + lease generation only);
    the raw token never enters LangGraph's checkpoint history. Here the mock
    IdP plays the vault.
    """
    body = json.dumps({"connection_id": connection_id,
                       "lease_generation": lease_generation}).encode()
    req = urllib.request.Request(f"{IDP_BASE}/reconsent", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode())["refresh_token"]


def make_node(step_id: str):
    def node(state: State) -> dict:
        try:
            resource_call(state["access_token"])
            updates: dict = {}
        except AuthError:
            tok = revive_refresh(provider, state["refresh_token"], SCOPES,
                                 credential_resolver=resolve_credential)  # may interrupt()
            resource_call(tok.access_token)
            updates = {"access_token": tok.access_token, "refresh_token": tok.refresh_token}
        print(f"  \033[32mok\033[0m  {STEPS.index(step_id)+1}/8 {step_id}")
        return {"done": state["done"] + [step_id], **updates}
    return node


def build_graph():
    g = StateGraph(State)
    for s in STEPS:
        g.add_node(s, make_node(s))
    g.add_edge(START, STEPS[0])
    for a, b in zip(STEPS, STEPS[1:]):
        g.add_edge(a, b)
    g.add_edge(STEPS[-1], END)
    return g.compile(checkpointer=MemorySaver())


def resume_run(data: dict) -> dict:
    """The resume handler: called once per verified recovery.resume_requested."""
    graph, config = RUNS[data["runId"]]
    result = graph.invoke(Command(resume={
        "connection_id": data["connectionId"],
        "lease_generation": data["generation"],
    }), config)
    if "__interrupt__" in result:
        raise RuntimeError("run parked again immediately after resume")
    return {"steps": len(result["done"])}


def deliver_signed_callback(data: dict) -> dict:
    """Simulate the control plane's delivery — identical wire format to
    deliverRuntimeResumeJob in lib/webhooks.ts."""
    event = {"id": "job_demo_1", "type": "recovery.resume_requested",
             "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "data": data}
    body = json.dumps(event, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    signed = f'{event["id"]}.{timestamp}.'.encode() + body
    signature = "v1," + hmac.new(SHARED_SECRET.encode(), signed, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        f"http://127.0.0.1:{RECEIVER_PORT}/", data=body, method="POST",
        headers={"Content-Type": "application/json", "Webhook-Id": event["id"],
                 "Webhook-Timestamp": timestamp, "Webhook-Signature": signature,
                 "Idempotency-Key": event["id"]})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


def main():
    idp = IdP()
    idp_server = make_server(idp, port=8751)
    receiver = ResumeReceiver(secret=SHARED_SECRET, resume=resume_run)
    receiver_server = serve(receiver, port=RECEIVER_PORT)
    try:
        print("\033[1mLANGGRAPH + RESUME ENDPOINT — dead-reauth-resume, full loop\033[0m")
        print("─" * 64)
        graph = build_graph()
        run_id = "run_nightly_1"
        config = {"configurable": {"thread_id": run_id}}
        RUNS[run_id] = (graph, config)

        dead_rt = idp.issue_refresh(SCOPES, dead=True)
        init: State = {"access_token": idp.mint_access(FAILURE_STEP),
                       "refresh_token": dead_rt, "done": []}
        result = graph.invoke(init, config)
        assert "__interrupt__" in result, "expected the thread to park on the dead token"
        payload = result["__interrupt__"][0].value
        print(f"  \033[34mPARKED\033[0m langgraph thread interrupted (checkpointed)")
        print(f"  \033[31mclassify\033[0m {payload['code']} · {payload['title']}")
        print(f"  \033[34mcontrol plane\033[0m identity verified → lease rotated → "
              f"signed callback → 127.0.0.1:{RECEIVER_PORT}")

        ack = deliver_signed_callback({
            "caseId": "rcv_demo_1", "workspaceId": "ws_demo", "runId": run_id,
            "checkpointId": None, "connectionId": "conn_demo_1",
            "actionKey": "graph.files", "idempotencyKey": "idem_demo_1", "generation": 2,
        })
        assert ack["ok"] and ack["resumed"] and ack["runId"] == run_id, ack
        print(f"  \033[32mack\033[0m {json.dumps(ack)}")
        print(f"  \033[34mcontrol plane\033[0m case identity_verified → resumed → completed")

        # Redelivery of the same webhook-id is served from the dedup cache —
        # the run is not resumed twice.
        replay = deliver_signed_callback({
            "caseId": "rcv_demo_1", "workspaceId": "ws_demo", "runId": run_id,
            "checkpointId": None, "connectionId": "conn_demo_1",
            "actionKey": "graph.files", "idempotencyKey": "idem_demo_1", "generation": 2,
        })
        assert replay == ack, "replayed delivery must return the stored acknowledgement"

        final = graph.get_state(config).values
        print("─" * 64)
        print(f"  \033[1m\033[32mCOMPLETED {len(final['done'])}/8 steps on the same "
              f"LangGraph thread, resumed by signed callback\033[0m")
        print(f"  done: {final['done']}\n")
    finally:
        receiver_server.shutdown()
        idp_server.shutdown()


if __name__ == "__main__":
    main()
