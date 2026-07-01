# ReviveBench local evidence

ReviveBench tests recovery correctness against a real local HTTP OAuth fixture.
It does not estimate customer outcomes.

## What the runner executes

Each case performs eight independent executions:

1. Same logical run resumes from its saved checkpoint.
2. A replacement worker resumes using only durable state.
3. A mismatched provider subject is rejected before the recovery capability is consumed.
4. The prior credential generation is rejected after lease rotation.
5. An ambiguous remote mutation is reconciled before its function can run again.

The runner is `sidecar/benchmarks/revivebench.py`. It starts the repository's
local OAuth server, makes real HTTP token and resource requests, exercises the
SQLite recovery store, and writes every failure into the JSON report.

## Latest checked-in local run

The report at `benchmarks/results/revivebench-local.json` contains 40 executions:
40 passed and 0 failed. These numbers describe one local run on the environment
recorded in that file. They are not an uptime, throughput, latency, provider
coverage or customer-success claim.

## Reproduce

```bash
npm run bench:revive
python3 -m unittest discover -s sidecar/tests -v
```

The public `/benchmarks` page renders the report as a whitepaper. Revive Lab does
not contain a benchmark dashboard.
