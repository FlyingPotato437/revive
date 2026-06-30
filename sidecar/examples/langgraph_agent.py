"""REAL LangGraph agent that survives a dead refresh token.

This uses LangGraph's actual StateGraph + checkpointer + interrupt()/Command —
not a simulation. The agent runs as a real graph; mid-run the access token
expires and the refresh token is dead, so Revive's adapter calls LangGraph's
`interrupt()` to durably park the thread. The driver routes the re-consent and
resumes with `Command(resume=...)`, splicing the fresh token into the SAME thread.

Run (needs langgraph):  python -m examples.langgraph_agent
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import TypedDict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from revive import Provider, AuthError
from revive.adapters.langgraph import revive_refresh
from examples.mock_idp import IdP, make_server

BASE = "http://127.0.0.1:8751"
SCOPES = ["offline_access", "Mail.ReadWrite", "Files.Read.All"]
STEPS = ["acquire", "identity", "inbox", "calendar", "files", "compose", "send", "archive"]
FAILURE_STEP = 4

provider = Provider("microsoft", f"{BASE}/oauth2/token", scopes=tuple(SCOPES))


class State(TypedDict):
    access_token: str
    refresh_token: str
    done: list


def resource_call(access_token: str):
    req = urllib.request.Request(f"{BASE}/resource",
                                 headers={"Authorization": f"Bearer {access_token}"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise AuthError(json.loads(e.read().decode())) from None
        raise


def ensure_token(state: State) -> dict:
    """Make one protected call. On 401, refresh; if the refresh token is dead,
    Revive durably pauses the LangGraph thread for re-consent, then splices."""
    try:
        resource_call(state["access_token"])
        return {}
    except AuthError:
        tok = revive_refresh(provider, state["refresh_token"], SCOPES)  # may interrupt()
        resource_call(tok.access_token)
        return {"access_token": tok.access_token, "refresh_token": tok.refresh_token}


def make_node(step_id: str):
    def node(state: State) -> dict:
        updates = ensure_token(state)
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


def reconsent(old_refresh: str) -> str:
    body = json.dumps({"refresh_token": old_refresh}).encode()
    req = urllib.request.Request(f"{BASE}/reconsent", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode())["refresh_token"]


def main():
    idp = IdP()
    httpd = make_server(idp, port=8751)
    try:
        print("\033[1mREAL LANGGRAPH AGENT — dead-reauth-resume\033[0m")
        print("─" * 64)
        graph = build_graph()
        config = {"configurable": {"thread_id": "nightly-1"}}
        dead_rt = idp.issue_refresh(SCOPES, dead=True)
        init: State = {"access_token": idp.mint_access(FAILURE_STEP),
                       "refresh_token": dead_rt, "done": []}

        result = graph.invoke(init, config)

        while "__interrupt__" in result:
            payload = result["__interrupt__"][0].value
            print(f"  \033[34mPARKED\033[0m langgraph thread interrupted (checkpointed)")
            print(f"  \033[31mclassify\033[0m {payload['code']} · {payload['title']} "
                  f"· conf {payload['confidence']:.2f}")
            print(f"  \033[34mre-consent\033[0m awaiting out-of-band approval…")
            new_rt = reconsent(dead_rt)
            print(f"  \033[32msplice\033[0m fresh token minted → resuming same thread")
            result = graph.invoke(Command(resume={"refresh_token": new_rt}), config)

        print("─" * 64)
        print(f"  \033[1m\033[32mCOMPLETED {len(result['done'])}/8 steps on the same "
              f"LangGraph logical thread recovered\033[0m")
        print(f"  done: {result['done']}\n")
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main()
