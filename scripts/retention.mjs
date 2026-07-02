#!/usr/bin/env node
const base = (process.env.REVIVE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.REVIVE_WORKER_SECRET;
if (!secret) {
  console.error("REVIVE_WORKER_SECRET is required");
  process.exit(1);
}
const response = await fetch(`${base}/api/internal/retention/run`, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(30_000),
});
const body = await response.json().catch(() => ({}));
console.log(JSON.stringify({ status: response.status, ...body }));
process.exit(response.ok ? 0 : 1);
