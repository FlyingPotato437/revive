"""ReviveBench local evidence runner.

This suite executes the recovery engine against a real local HTTP OAuth fixture.
It reports observed invariants and wall-clock timings. It does not estimate
production recovery rates or claim customer savings.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

SIDECAR = Path(__file__).resolve().parents[1]
ROOT = SIDECAR.parent
sys.path.insert(0, str(SIDECAR))

from examples.mock_idp import IdP, make_server
from revive import (AmbiguousSideEffect, AuthError, CheckpointStore, Completed,
                    Engine, Parked, Provider, StaleCredentialGeneration, Step,
                    Token, WrongRecoveryIdentity)

SCOPES = ["offline_access", "Mail.ReadWrite"]
ITERATIONS = 8


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * q))]


def commit_sha() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True
        ).strip()
    except (OSError, subprocess.SubprocessError):
        return None


def source_tree_dirty() -> bool | None:
    try:
        return bool(subprocess.check_output(
            ["git", "status", "--porcelain"], cwd=ROOT, text=True
        ).strip())
    except (OSError, subprocess.SubprocessError):
        return None


class Bench:
    def __init__(self) -> None:
        self.idp = IdP()
        self.server = make_server(self.idp, port=0, refresh_uses=100)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.sequence = 0

    def close(self) -> None:
        self.server.shutdown()

    def resource(self, access_token: str) -> None:
        request = urllib.request.Request(
            f"{self.base}/resource", headers={"Authorization": f"Bearer {access_token}"}
        )
        try:
            with urllib.request.urlopen(request, timeout=5):
                return
        except urllib.error.HTTPError as error:
            if error.code == 401:
                raise AuthError(json.loads(error.read().decode())) from None
            raise

    def reconsent(self, old_refresh: str) -> str:
        body = json.dumps({"refresh_token": old_refresh}).encode()
        request = urllib.request.Request(
            f"{self.base}/reconsent", data=body,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.loads(response.read().decode())["refresh_token"]

    def steps(self, executed: list[str] | None = None) -> list[Step]:
        executed = executed if executed is not None else []

        def make(step_id: str) -> Step:
            def call(context) -> None:
                self.resource(context.access_token)
                context.state.setdefault("done", []).append(step_id)
                executed.append(step_id)
            return Step(step_id, call)

        return [make(step_id) for step_id in ("read", "classify", "compose", "deliver")]

    def setup(self, label: str) -> tuple[CheckpointStore, Provider, Engine, Token, list[Step], str]:
        self.sequence += 1
        store = CheckpointStore(":memory:")
        provider = Provider("microsoft", f"{self.base}/oauth2/token", scopes=tuple(SCOPES))
        engine = Engine(provider, store, base_url=self.base, channel=lambda _rendezvous: None)
        dead_refresh = self.idp.issue_refresh(SCOPES, dead=True)
        token = Token(
            self.idp.mint_access(2), dead_refresh,
            subject="alice@company.com", tenant="company-tenant",
            lease_id=f"lease_{label}_{self.sequence}", generation=1,
        )
        return store, provider, engine, token, self.steps(), dead_refresh

    def same_run_resume(self) -> None:
        _, _, engine, token, steps, dead_refresh = self.setup("resume")
        run_id = f"run_resume_{self.sequence}"
        parked = engine.run(run_id, steps, token, SCOPES)
        assert isinstance(parked, Parked)
        assert parked.checkpoint.run_id == run_id
        new_refresh = self.reconsent(dead_refresh)
        completed = engine.resume(run_id, steps, {
            "refresh_token": new_refresh,
            "provider_subject": "alice@company.com",
            "provider_tenant": "company-tenant",
        })
        assert isinstance(completed, Completed)
        assert completed.steps_done == 4
        assert completed.state["_lease_generation"] == 2

    def restart_resume(self) -> None:
        store, provider, engine, token, steps, dead_refresh = self.setup("restart")
        run_id = f"run_restart_{self.sequence}"
        assert isinstance(engine.run(run_id, steps, token, SCOPES), Parked)
        replacement_worker = Engine(provider, store, base_url=self.base, channel=lambda _rendezvous: None)
        completed = replacement_worker.resume(run_id, steps, {
            "refresh_token": self.reconsent(dead_refresh),
            "provider_subject": "alice@company.com",
            "provider_tenant": "company-tenant",
        })
        assert isinstance(completed, Completed)

    def wrong_account_blocked(self) -> None:
        _, _, engine, token, steps, dead_refresh = self.setup("identity")
        run_id = f"run_identity_{self.sequence}"
        assert isinstance(engine.run(run_id, steps, token, SCOPES), Parked)
        new_refresh = self.reconsent(dead_refresh)
        try:
            engine.resume(run_id, steps, {
                "refresh_token": new_refresh,
                "provider_subject": "bob@company.com",
                "provider_tenant": "company-tenant",
            })
        except WrongRecoveryIdentity:
            return
        raise AssertionError("wrong provider subject was accepted")

    def stale_worker_fenced(self) -> None:
        _, _, engine, token, steps, dead_refresh = self.setup("fence")
        run_id = f"run_fence_{self.sequence}"
        assert isinstance(engine.run(run_id, steps, token, SCOPES), Parked)
        completed = engine.resume(run_id, steps, {
            "refresh_token": self.reconsent(dead_refresh),
            "provider_subject": "alice@company.com",
            "provider_tenant": "company-tenant",
        })
        assert isinstance(completed, Completed)
        try:
            engine.run(f"old_worker_{self.sequence}", [], token, SCOPES)
        except StaleCredentialGeneration:
            return
        raise AssertionError("old credential generation was accepted")

    def side_effect_reconciled(self) -> None:
        store = CheckpointStore(":memory:")
        provider = Provider("microsoft", f"{self.base}/oauth2/token", scopes=tuple(SCOPES))
        engine = Engine(provider, store, base_url=self.base, channel=lambda _rendezvous: None)
        token = Token(self.idp.mint_access(10), self.idp.issue_refresh(SCOPES))
        executed = {"count": 0}

        def mutate(_context) -> None:
            executed["count"] += 1

        step = Step("send", mutate, side_effect=True, reconcile=lambda _context: True)
        action_id = f"run_effect_{self.sequence}:send"
        store.start_action(action_id, f"run_effect_{self.sequence}", "send")
        result = engine.run(f"run_effect_{self.sequence}", [step], token, SCOPES)
        assert isinstance(result, Completed)
        assert executed["count"] == 0
        assert store.action_state(action_id) == "completed"


def run_case(bench: Bench, case_id: str, title: str, fn) -> dict:
    durations: list[float] = []
    failures: list[str] = []
    for _ in range(ITERATIONS):
        started = time.perf_counter()
        try:
            fn()
        except Exception as error:  # recorded in the report, not hidden
            failures.append(f"{type(error).__name__}: {error}")
        durations.append((time.perf_counter() - started) * 1000)
    return {
        "id": case_id,
        "title": title,
        "iterations": ITERATIONS,
        "passed": ITERATIONS - len(failures),
        "failed": len(failures),
        "p50Ms": round(median(durations), 3),
        "p95Ms": round(percentile(durations, 0.95), 3),
        "failures": failures,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(ROOT / "benchmarks/results/revivebench-local.json"))
    args = parser.parse_args()
    bench = Bench()
    try:
        definitions = [
            ("same-run-resume", "Same logical run resumes", bench.same_run_resume),
            ("worker-restart", "Recovery survives worker replacement", bench.restart_resume),
            ("identity-binding", "Wrong provider subject is rejected", bench.wrong_account_blocked),
            ("generation-fencing", "Old credential generation is fenced", bench.stale_worker_fenced),
            ("side-effect-reconcile", "Ambiguous side effect reconciles before replay", bench.side_effect_reconciled),
        ]
        cases = [run_case(bench, *definition) for definition in definitions]
    finally:
        bench.close()

    total = sum(case["iterations"] for case in cases)
    passed = sum(case["passed"] for case in cases)
    report = {
        "schemaVersion": 1,
        "name": "ReviveBench local recovery invariants",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCommit": commit_sha(),
        "sourceTreeDirty": source_tree_dirty(),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "fixture": "local HTTP OAuth provider",
        },
        "methodology": {
            "iterationsPerCase": ITERATIONS,
            "scope": "local correctness and latency only",
            "exclusions": [
                "customer production recovery rate",
                "provider-wide compatibility",
                "cost savings",
                "availability or throughput SLOs",
            ],
        },
        "summary": {"executions": total, "passed": passed, "failed": total - passed},
        "cases": cases,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["summary"]))
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
