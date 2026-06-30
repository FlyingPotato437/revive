"""Parley — the platform generalization.

Revive recovers a dead token (`kind="auth"`). The SAME park-route-resume engine
handles ANY out-of-band human input an unattended agent needs. Here a finance
agent must get human approval before sending a wire — it parks mid-run, routes
the approval out-of-band, and resumes on the reply. Identical machinery to the
dead-token splice; only the rendezvous `kind` differs.

Run:  python -m examples.parley_approval
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from revive import (CheckpointStore, Engine, NeedsApproval, Provider, Step, Token)

C = {"b": "\033[34m", "g": "\033[32m", "r": "\033[31m", "x": "\033[0m", "bold": "\033[1m"}


def reconcile(ctx):
    ctx.state["matched"] = 142
    print(f"  {C['g']}ok{C['x']}      reconcile invoices · 142 matched")


def approve_wire(ctx):
    reply = ctx.state.pop("_reply", None)
    if reply is None:
        raise NeedsApproval("Approve $40,000 wire to ACME Corp?",
                            {"amount": 40000, "payee": "ACME Corp", "currency": "USD"})
    if not reply.get("approved"):
        ctx.state["wire"] = "cancelled"
        print(f"  {C['r']}halt{C['x']}    wire cancelled by approver")
        return
    ctx.state["wire"] = "sent"
    print(f"  {C['g']}ok{C['x']}      wire sent (human-approved)")


def notify(ctx):
    print(f"  {C['g']}ok{C['x']}      posted summary to #finance")


def main():
    store = CheckpointStore(":memory:")
    provider = Provider("none", "http://localhost/none")  # unused: no auth here
    engine = Engine(provider, store, base_url="http://localhost:8750",
                    on_event=lambda t, m: print(f"  {C['b']}{t:<10}{C['x']}{m}"))

    steps = [Step("reconcile", reconcile), Step("approve_wire", approve_wire),
             Step("notify", notify)]

    print(f"{C['bold']}PARLEY — human-in-the-loop rendezvous (same engine as Revive){C['x']}")
    print("─" * 64)
    parked = engine.run("run_finance", steps, Token("at_x", "rt_x"), scopes=[])
    print(f"  {C['b']}parked{C['x']}    awaiting human approval · "
          f"{parked.rendezvous.context.get('amount')} {parked.rendezvous.context.get('currency')} "
          f"→ {parked.rendezvous.context.get('payee')}")

    # human approves out-of-band
    done = engine.resume("run_finance", steps, reply={"approved": True},
                         token=Token("at_x", "rt_x"))
    print("─" * 64)
    print(f"  {C['bold']}{C['g']}COMPLETED {done.steps_done}/3 steps · resumed after approval · "
          f"same logical run{C['x']}\n")


if __name__ == "__main__":
    main()
