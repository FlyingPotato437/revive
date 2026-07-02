#!/usr/bin/env node
// Persistent queue worker. Drains the Postgres job queue continuously through
// the authenticated internal drain endpoint, with adaptive backoff, graceful
// shutdown, and a stall alert when the queue stops making progress.
//
//   REVIVE_WORKER_SECRET=… REVIVE_BASE_URL=http://localhost:3000 node scripts/worker.mjs
//
// Deploy one instance per environment (systemd/ECS/Fly machine). The drain
// endpoint claims with FOR UPDATE SKIP LOCKED, so extra replicas are safe.

const BASE = (process.env.REVIVE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.REVIVE_WORKER_SECRET;
const BATCH = Number(process.env.REVIVE_WORKER_BATCH || 10);
const IDLE_MS = Number(process.env.REVIVE_WORKER_IDLE_MS || 5_000);
const BUSY_MS = Number(process.env.REVIVE_WORKER_BUSY_MS || 250);
const STALL_ALERT_MS = Number(process.env.REVIVE_WORKER_STALL_ALERT_MS || 120_000);

if (!SECRET) {
  console.error("REVIVE_WORKER_SECRET is required");
  process.exit(1);
}

let running = true;
let inFlight = null;
let consecutiveFailures = 0;
let lastSuccessAt = Date.now();

function log(level, message, extra = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), level, message, ...extra }));
}

async function drainOnce() {
  const response = await fetch(`${BASE}/api/internal/jobs/drain?limit=${BATCH}`, {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 503) return { claimed: 0, degraded: "database not configured" };
  if (!response.ok) throw new Error(`drain failed: HTTP ${response.status}`);
  return response.json();
}

async function loop() {
  log("info", "worker started", { base: BASE, batch: BATCH });
  while (running) {
    try {
      inFlight = drainOnce();
      const result = await inFlight;
      inFlight = null;
      consecutiveFailures = 0;
      lastSuccessAt = Date.now();
      if (result.degraded) {
        log("warn", "queue degraded", { detail: result.degraded });
        await sleep(IDLE_MS * 4);
        continue;
      }
      if (result.claimed > 0) log("info", "jobs processed", { claimed: result.claimed });
      await sleep(result.claimed >= BATCH ? BUSY_MS : IDLE_MS);
    } catch (error) {
      inFlight = null;
      consecutiveFailures += 1;
      const backoff = Math.min(IDLE_MS * 2 ** Math.min(consecutiveFailures, 6), 120_000);
      log("error", "drain error", { error: String(error?.message || error), consecutiveFailures, backoffMs: backoff });
      if (Date.now() - lastSuccessAt > STALL_ALERT_MS) {
        log("alert", "queue stalled: no successful drain inside alert window", {
          stalledForMs: Date.now() - lastSuccessAt,
        });
      }
      await sleep(backoff);
    }
  }
  // graceful: let the in-flight drain finish before exit
  if (inFlight) {
    try { await inFlight; } catch { /* already logged */ }
  }
  log("info", "worker stopped cleanly");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log("info", `received ${signal}, finishing in-flight batch`);
    running = false;
  });
}

loop().then(() => process.exit(0));
