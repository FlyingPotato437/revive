"""End-to-end REAL recovery demo (no simulation).

Runs a multi-step "Nightly Exec Briefing" agent against the local mock IdP +
protected resource over real HTTP. The refresh token is dead; the access token
expires mid-run. We show:

  1. BASELINE (no Revive): the run hits the dead token, retries the stale token,
     and is abandoned — reproducing Codex #14144 / Claude Code #12447.
  2. REVIVE: classify → checkpoint → re-consent → rotate lease → resume
     the SAME run from the exact step → completion.

Run:  python -m examples.nightly_briefing
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from revive import (CheckpointStore, Engine, Provider, Step, Token, TokenError,
                    AuthError, classify, Verdict)
from examples.mock_idp import IdP, make_server

BASE = "http://127.0.0.1:8750"
SCOPES = ["offline_access", "Mail.ReadWrite", "Calendars.Read", "Files.Read.All"]
STEP_IDS = ["acquire", "identity", "inbox", "calendar", "files", "compose", "send", "archive"]
STEP_LABELS = {
    "acquire": "Acquire Graph token", "identity": "Resolve service identity",
    "inbox": "Scan overnight inbox", "calendar": "Pull tomorrow's calendar",
    "files": "Gather modified documents", "compose": "Compose executive briefing",
    "send": "Send the 6:00am briefing", "archive": "Archive processed threads",
}
FAILURE_STEP = 4  # "Gather modified documents"

C = {"b": "\033[34m", "g": "\033[32m", "r": "\033[31m", "y": "\033[33m",
     "d": "\033[2m", "x": "\033[0m", "bold": "\033[1m"}


def resource_call(access_token: str) -> dict:
    """A REAL protected GET. Raises AuthError on 401 (expired access token)."""
    req = urllib.request.Request(f"{BASE}/resource",
                                 headers={"Authorization": f"Bearer {access_token}"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:  # type: ignore[attr-defined]
        if e.code == 401:
            raise AuthError(json.loads(e.read().decode())) from None
        raise


def build_steps() -> list[Step]:
    def make(step_id):
        def fn(ctx):
            resource_call(ctx.access_token)          # real protected call
            ctx.state.setdefault("done", []).append(step_id)
            time.sleep(0.05)
        return Step(id=step_id, fn=fn)
    return [make(s) for s in STEP_IDS]


def reconsent(old_refresh: str) -> str:
    """Simulate a human completing the out-of-band re-consent link."""
    body = json.dumps({"refresh_token": old_refresh}).encode()
    req = urllib.request.Request(f"{BASE}/reconsent", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode())["refresh_token"]


def banner(title):
    print(f"\n{C['bold']}{title}{C['x']}")
    print("─" * 64)


def ev(tag, msg):
    color = {"ok": "g", "classify": "r", "checkpoint": "b", "rendezvous": "b",
             "splice": "g", "resume": "g", "refresh": "y", "auth": "y"}.get(tag, "d")
    print(f"  {C[color]}{tag:<11}{C['x']}{msg}")


# --- BASELINE: no sidecar -------------------------------------------------
def run_baseline(idp: IdP):
    banner("WITHOUT REVIVE — vanilla agent")
    provider = Provider("microsoft", f"{BASE}/oauth2/token", scopes=tuple(SCOPES))
    dead_rt = idp.issue_refresh(SCOPES, dead=True)
    token = Token(idp.mint_access(FAILURE_STEP), dead_rt)
    steps = build_steps()
    for i, step in enumerate(steps):
        try:
            step.fn(type("Ctx", (), {"access_token": token.access_token,
                                     "state": {}, "step_id": step.id})())
            print(f"  {C['g']}ok         {C['x']}{i+1}/8 {STEP_LABELS[step.id]}")
        except AuthError:
            for attempt in range(1, 4):
                try:
                    token = provider.refresh(token.refresh_token)
                    break
                except TokenError as te:
                    print(f"  {C['y']}retry #{attempt}  {C['x']}silent refresh failed — reusing "
                          f"stale token {token.fingerprint}")
            else:
                print(f"  {C['r']}abandon    {C['x']}run abandoned at step {i+1}/8 — "
                      f"{8-i} steps never ran. Manual restart required.")
                return {"completed": i, "status": "abandoned"}
    return {"completed": 8, "status": "completed"}


# --- REVIVE ----------------------------------------------------------------
def run_revive(idp: IdP):
    banner("WITH REVIVE — sidecar")
    store = CheckpointStore(":memory:")
    provider = Provider("microsoft", f"{BASE}/oauth2/token", scopes=tuple(SCOPES))
    engine = Engine(provider, store, base_url=BASE, on_event=ev)

    dead_rt = idp.issue_refresh(SCOPES, dead=True)
    token = Token(idp.mint_access(FAILURE_STEP), dead_rt)
    steps = build_steps()

    result = engine.run("run_briefing", steps, token, SCOPES)
    if not hasattr(result, "rendezvous"):
        print("unexpected: run did not park"); return
    print(f"  {C['b']}parked     {C['x']}run frozen — awaiting re-consent "
          f"(no work lost, {len(result.checkpoint.cursor.get('done', []))} steps done)")

    # human completes the out-of-band re-consent link -> new refresh token
    time.sleep(0.3)
    new_rt = reconsent(dead_rt)
    print(f"  {C['g']}consent    {C['x']}human approved re-consent → new refresh token minted")

    done = engine.resume("run_briefing", steps, reply={"refresh_token": new_rt})
    print(f"  {C['g']}{C['bold']}complete   {C['x']}{C['bold']}"
          f"{done.steps_done}/8 steps · {done.splices} splice · "
          f"recovered in {done.recovered_ms/1000:.2f}s · same logical run{C['x']}")
    return done


def main():
    idp = IdP()
    httpd = make_server(idp)
    try:
        base = run_baseline(idp)
        rev = run_revive(idp)
        banner("RESULT")
        print(f"  baseline : {C['r']}{base['completed']}/8 steps · {base['status']}{C['x']}")
        print(f"  revive   : {C['g']}{rev.steps_done}/8 steps · recovered logical run{C['x']}")
        print()
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main()
