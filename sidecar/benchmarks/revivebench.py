"""ReviveBench local evidence runner.

This suite executes the recovery engine against a real local HTTP OAuth fixture.
It reports observed invariants and wall-clock timings. It does not estimate
production recovery rates or claim customer savings.
"""
from __future__ import annotations

import argparse
import json
import platform
import subprocess
import sys
import tempfile
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
from revive import (AuthError, CheckpointStore, Completed,
                    Engine, Parked, Provider, StaleCredentialGeneration, Step,
                    Token, WrongRecoveryIdentity)

SCOPES = ["offline_access", "Mail.ReadWrite", "Mail.Send"]
ITERATIONS = 20


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
        self.databases = tempfile.TemporaryDirectory(prefix="revivebench-")

    def close(self) -> None:
        self.server.shutdown()
        self.databases.cleanup()

    def database(self, label: str) -> str:
        return str(Path(self.databases.name) / f"{label}-{self.sequence}.sqlite")

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

    def setup(self, label: str, store_path: str = ":memory:") -> tuple[CheckpointStore, Provider, Engine, Token, list[Step], str, list[dict]]:
        self.sequence += 1
        events: list[dict] = []
        store = CheckpointStore(store_path)
        provider = Provider("microsoft", f"{self.base}/oauth2/token", scopes=tuple(SCOPES))
        engine = Engine(
            provider,
            store,
            base_url=self.base,
            channel=lambda _rendezvous: None,
            on_event=lambda tag, message: events.append({"tag": tag, "message": message}),
        )
        dead_refresh = self.idp.issue_refresh(SCOPES, dead=True)
        token = Token(
            self.idp.mint_access(2), dead_refresh,
            subject="alice@company.com", tenant="company-tenant",
            lease_id=f"lease_{label}_{self.sequence}", generation=1,
        )
        return store, provider, engine, token, self.steps(), dead_refresh, events

    def same_run_resume(self) -> dict:
        store, _, engine, token, steps, dead_refresh, events = self.setup("resume")
        run_id = f"run_resume_{self.sequence}"
        try:
            parked = engine.run(run_id, steps, token, SCOPES)
            assert isinstance(parked, Parked)
            assert parked.checkpoint.run_id == run_id
            checkpoint_step = parked.checkpoint.step_id
            new_refresh = self.reconsent(dead_refresh)
            completed = engine.resume(run_id, steps, {
                "refresh_token": new_refresh,
                "provider_subject": "alice@company.com",
                "provider_tenant": "company-tenant",
            })
            assert isinstance(completed, Completed)
            assert completed.steps_done == 4
            assert completed.state["_lease_generation"] == 2
            return {
                "runId": run_id,
                "checkpointStep": checkpoint_step,
                "stepsCompleted": completed.steps_done,
                "finalGeneration": completed.state["_lease_generation"],
                "eventTags": [event["tag"] for event in events],
            }
        finally:
            store.close()

    def restart_resume(self) -> dict:
        db_path = str(Path(self.databases.name) / f"restart-{self.sequence + 1}.sqlite")
        store, provider, engine, token, steps, dead_refresh, events = self.setup("restart", db_path)
        run_id = f"run_restart_{self.sequence}"
        replacement_store = None
        original_store_closed = False
        try:
            assert isinstance(engine.run(run_id, steps, token, SCOPES), Parked)
            store.close()
            original_store_closed = True
            replacement_store = CheckpointStore(db_path)
            replacement_worker = Engine(
                provider,
                replacement_store,
                base_url=self.base,
                channel=lambda _rendezvous: None,
                on_event=lambda tag, message: events.append({"tag": tag, "message": message}),
            )
            completed = replacement_worker.resume(run_id, steps, {
                "refresh_token": self.reconsent(dead_refresh),
                "provider_subject": "alice@company.com",
                "provider_tenant": "company-tenant",
            })
            assert isinstance(completed, Completed)
            return {
                "runId": run_id,
                "storeReopened": True,
                "stepsCompleted": completed.steps_done,
                "eventTags": [event["tag"] for event in events],
            }
        finally:
            if replacement_store is not None:
                replacement_store.close()
            if not original_store_closed:
                store.close()

    def wrong_account_blocked(self) -> dict:
        store, _, engine, token, steps, dead_refresh, events = self.setup("identity")
        run_id = f"run_identity_{self.sequence}"
        try:
            assert isinstance(engine.run(run_id, steps, token, SCOPES), Parked)
            new_refresh = self.reconsent(dead_refresh)
            try:
                engine.resume(run_id, steps, {
                    "refresh_token": new_refresh,
                    "provider_subject": "bob@company.com",
                    "provider_tenant": "company-tenant",
                })
            except WrongRecoveryIdentity:
                return {
                    "runId": run_id,
                    "expectedSubject": "alice@company.com",
                    "attemptedSubject": "bob@company.com",
                    "mismatchRejected": True,
                    "eventTags": [event["tag"] for event in events],
                }
            raise AssertionError("wrong provider subject was accepted")
        finally:
            store.close()

    def stale_worker_fenced(self) -> dict:
        store, _, engine, token, steps, dead_refresh, events = self.setup("fence")
        run_id = f"run_fence_{self.sequence}"
        try:
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
                return {
                    "runId": run_id,
                    "staleGeneration": token.generation,
                    "activeGeneration": completed.state["_lease_generation"],
                    "staleWorkerRejected": True,
                    "eventTags": [event["tag"] for event in events],
                }
            raise AssertionError("old credential generation was accepted")
        finally:
            store.close()

    def side_effect_reconciled(self) -> dict:
        self.sequence += 1
        store = CheckpointStore(":memory:")
        provider = Provider("microsoft", f"{self.base}/oauth2/token", scopes=tuple(SCOPES))
        events: list[dict] = []
        engine = Engine(
            provider,
            store,
            base_url=self.base,
            channel=lambda _rendezvous: None,
            on_event=lambda tag, message: events.append({"tag": tag, "message": message}),
        )
        token = Token(self.idp.mint_access(10), self.idp.issue_refresh(SCOPES))
        executed = {"count": 0}

        def mutate(_context) -> None:
            executed["count"] += 1

        step = Step("send", mutate, side_effect=True, reconcile=lambda _context: True)
        action_id = f"run_effect_{self.sequence}:send"
        store.start_action(action_id, f"run_effect_{self.sequence}", "send")
        try:
            result = engine.run(f"run_effect_{self.sequence}", [step], token, SCOPES)
            assert isinstance(result, Completed)
            assert executed["count"] == 0
            assert store.action_state(action_id) == "completed"
            return {
                "runId": f"run_effect_{self.sequence}",
                "mutationCalls": executed["count"],
                "actionState": store.action_state(action_id),
                "reconciledBeforeReplay": True,
                "eventTags": [event["tag"] for event in events],
            }
        finally:
            store.close()


def run_case(bench: Bench, case_id: str, title: str, fn) -> dict:
    durations: list[float] = []
    failures: list[str] = []
    runs: list[dict] = []
    for iteration in range(1, ITERATIONS + 1):
        started = time.perf_counter()
        observation = None
        failure = None
        try:
            observation = fn()
        except Exception as error:  # recorded in the report, not hidden
            failure = f"{type(error).__name__}: {error}"
            failures.append(failure)
        duration = (time.perf_counter() - started) * 1000
        durations.append(duration)
        runs.append({
            "executionId": f"{case_id}-{iteration:03d}",
            "passed": failure is None,
            "durationMs": round(duration, 3),
            "failure": failure,
            "observed": observation,
        })
    p50 = round(median(durations), 3)
    successful_runs = [run for run in runs if run["passed"]]
    representative = min(
        successful_runs,
        key=lambda run: abs(run["durationMs"] - p50),
        default=None,
    )
    return {
        "id": case_id,
        "title": title,
        "iterations": ITERATIONS,
        "passed": ITERATIONS - len(failures),
        "failed": len(failures),
        "p50Ms": p50,
        "p95Ms": round(percentile(durations, 0.95), 3),
        "failures": failures,
        "runs": runs,
        "exampleRun": representative,
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
            "assertionModel": "Each execution fails closed on an unmet recovery invariant",
            "providerTransport": "HTTP requests to an isolated local OAuth fixture",
            "restartPersistence": "File-backed SQLite closed and reopened by a replacement worker",
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
