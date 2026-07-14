#!/usr/bin/env python3
"""Deterministic 1,000-run local recovery fault campaign.

This is correctness evidence against SQLite and the SDK receiver, not a claim
about hosted availability, latency, throughput, or provider compatibility.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import random
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sidecar"))

from revive import CheckpointStore, Engine, ResumeReceiver, WrongRecoveryIdentity  # noqa: E402

SECRET = "resilience-campaign-shared-secret-32-bytes"


def signed(event: dict) -> tuple[dict[str, str], bytes]:
    body = json.dumps(event, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    digest = hmac.new(
        SECRET.encode(), f'{event["id"]}.{timestamp}.'.encode() + body, hashlib.sha256
    ).hexdigest()
    return ({
        "Webhook-Id": event["id"],
        "Webhook-Timestamp": timestamp,
        "Webhook-Signature": "v1," + digest,
        "Idempotency-Key": event["id"],
    }, body)


def event(run_id: str, generation: int, suffix: str = "resume") -> dict:
    return {
        "id": f"job_{run_id}_{suffix}",
        "type": "recovery.resume_requested",
        "createdAt": "local-campaign",
        "data": {
            "caseId": f"case_{run_id}", "workspaceId": "ws_resilience",
            "runId": run_id, "checkpointId": "protected-write",
            "connectionId": "conn_campaign", "actionKey": "provider.write",
            "idempotencyKey": f"idem_{run_id}", "generation": generation,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=731_2026)
    args = parser.parse_args()
    if args.runs < 1:
        raise SystemExit("--runs must be positive")

    rng = random.Random(args.seed)
    counters = {
        "runs": args.runs,
        "workerReplacements": 0,
        "postCommitLosses": 0,
        "providerReconciliations": 0,
        "safeReplays": 0,
        "staleWakeupsRejected": 0,
        "wrongIdentitiesRejected": 0,
        "staleLeasesRejected": 0,
        "durableCallbackReplays": 0,
        "tamperedCallbacksRejected": 0,
        "duplicateWrites": 0,
    }
    started = time.time()

    with tempfile.TemporaryDirectory(prefix="revive-resilience-") as directory:
        root = Path(directory)
        receipt_db = str(root / "receipts.db")
        for index in range(args.runs):
            run_id = f"run_{index:04d}"
            action_id = f"{run_id}:provider-write"
            state_db = str(root / f"{run_id}.db")
            provider_writes: set[str] = set()

            worker_a = CheckpointStore(state_db)
            worker_a.start_action(action_id, run_id, "protected-write")
            committed_before_loss = rng.random() < 0.62
            if committed_before_loss:
                provider_writes.add(action_id)
                counters["postCommitLosses"] += 1
            worker_a.ensure_lease(f"lease_{run_id}", 1)
            worker_a.close()

            # Replacement worker has no process memory; it recovers action and
            # lease state entirely from SQLite.
            worker_b = CheckpointStore(state_db)
            counters["workerReplacements"] += 1
            if worker_b.action_state(action_id) != "started":
                raise AssertionError("replacement worker lost ambiguous action state")
            if action_id in provider_writes:
                worker_b.complete_action(action_id)
                counters["providerReconciliations"] += 1
            else:
                worker_b.reset_action(action_id)
                worker_b.start_action(action_id, run_id, "protected-write")
                provider_writes.add(action_id)
                worker_b.complete_action(action_id)
                counters["safeReplays"] += 1
            if len(provider_writes) != 1:
                counters["duplicateWrites"] += 1

            generation = worker_b.rotate_lease(f"lease_{run_id}", 1)
            try:
                worker_b.assert_lease_generation(f"lease_{run_id}", 1)
            except ValueError:
                counters["staleLeasesRejected"] += 1
            else:
                raise AssertionError("stale lease was accepted")
            worker_b.close()

            try:
                Engine._verify_recovery_identity(
                    {"expected_subject": f"owner_{index}", "expected_tenant": "tenant_a"},
                    {"provider_subject": f"attacker_{index}", "provider_tenant": "tenant_a"},
                )
            except WrongRecoveryIdentity:
                counters["wrongIdentitiesRejected"] += 1
            else:
                raise AssertionError("wrong recovery identity was accepted")

            resume_calls: list[str] = []

            def resume(data: dict) -> None:
                if data.get("generation") != generation:
                    raise RuntimeError("stale continuation generation")
                resume_calls.append(str(data.get("runId")))

            receiver_a = ResumeReceiver(SECRET, resume=resume, dedupe_path=receipt_db)
            stale_status, _ = receiver_a.handle(*signed(event(run_id, 1, "stale")))
            if stale_status != 500:
                raise AssertionError("stale wakeup was not rejected")
            counters["staleWakeupsRejected"] += 1

            correct = signed(event(run_id, generation))
            status, acknowledgement = receiver_a.handle(*correct)
            if status != 200 or acknowledgement.get("resumed") is not True:
                raise AssertionError("correct continuation did not resume")
            if index % 10 == 0:
                tampered_headers, tampered_body = correct
                tampered_headers = {**tampered_headers, "Webhook-Signature": "v1,invalid"}
                tampered_status, _ = receiver_a.handle(tampered_headers, tampered_body)
                if tampered_status != 401:
                    raise AssertionError("tampered callback was accepted")
                counters["tamperedCallbacksRejected"] += 1
            receiver_a.close()

            receiver_b = ResumeReceiver(
                SECRET,
                resume=lambda data: (_ for _ in ()).throw(RuntimeError("durable replay executed")),
                dedupe_path=receipt_db,
            )
            replay_status, replay_ack = receiver_b.handle(*correct)
            receiver_b.close()
            if replay_status != 200 or replay_ack != acknowledgement or resume_calls != [run_id]:
                raise AssertionError("durable callback receipt did not suppress replay")
            counters["durableCallbackReplays"] += 1

    if counters["duplicateWrites"]:
        raise AssertionError(f'{counters["duplicateWrites"]} duplicate provider writes')
    elapsed_ms = round((time.time() - started) * 1000, 2)
    report = {
        "kind": "revive-local-resilience-campaign",
        "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "seed": args.seed,
        "elapsedMs": elapsed_ms,
        "caveat": "Local SQLite/SDK correctness campaign; not production load, uptime, latency, recovery-rate, or provider-compatibility evidence.",
        "invariants": {
            "exactlyOneProviderWrite": counters["duplicateWrites"] == 0,
            "everyStaleWakeupRejected": counters["staleWakeupsRejected"] == args.runs,
            "everyWrongIdentityRejected": counters["wrongIdentitiesRejected"] == args.runs,
            "everyOldLeaseFenced": counters["staleLeasesRejected"] == args.runs,
            "everySuccessfulCallbackDurable": counters["durableCallbackReplays"] == args.runs,
        },
        "counts": counters,
    }
    target = ROOT / "benchmarks" / "results" / "resilience-campaign-local.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + "\n")
    print(f"resilience campaign: {args.runs}/{args.runs} runs passed in {elapsed_ms:.2f}ms")
    print(f"report: {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

