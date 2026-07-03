// ---------------------------------------------------------------------------
// The Revive engine.
//
// Drives two real runs of the same scripted agent, side by side:
//   • baseline: no sidecar. On a dead refresh token it silently reuses the
//     stale access token, loops, and dies. (Reproduces the documented open bugs:
//     Codex #14144, Claude Code #12447, Copilot CLI #2779.)
//   • revive: the sidecar. On a dead refresh token it (1) classifies, (2)
//     captures a step-accurate durable checkpoint, (3) fires a URL-mode
//     re-consent elicitation, and (4) rotates the credential lease and resumes
//     the same logical run from its durable checkpoint.
//
// Resume is triggered out-of-band by an HTTP POST from the re-consent page, so
// the splice is genuinely asynchronous, not a UI animation.
// ---------------------------------------------------------------------------

import { classify } from "./classifier";
import {
  fingerprint,
  graphResourceUnauthorized,
  mintAccessToken,
  tokenEndpoint,
} from "./mock-graph";
import {
  emit,
  flushSession,
  getSession,
  putSession,
  registerTicket,
  sessionForTicket,
} from "./store";
import { buildSteps } from "./steps";
import crypto from "node:crypto";
import { enqueueWebhookEvent } from "./webhooks";
import type {
  ClassifierResult,
  Lane,
  Provider,
  ReconsentTicket,
  RunState,
  SessionState,
} from "./types";

const PROVIDER: Provider = "microsoft";
const ACCOUNT = process.env.REVIVE_RECOVERY_ACCOUNT || "svc-briefing@contoso.com";
const SCOPES = ["offline_access", "Mail.ReadWrite", "Mail.Send", "Calendars.Read", "Files.Read.All"];
const BASE_DELAY = 780; // per-step pacing (ms), tuned for watchable animation
const MAX_BASELINE_RETRIES = 4;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function rid(p: string) {
  return `${p}${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function freshToken(generation: number, leaseId = rid("lease_")) {
  const access = mintAccessToken(SCOPES, generation);
  return {
    leaseId,
    fingerprint: fingerprint(access),
    issuedAt: Date.now(),
    scopes: SCOPES,
    generation,
    state: "active" as const,
  };
}

function newRun(lane: Lane): RunState {
  return {
    id: rid(lane === "baseline" ? "base_" : "rev_"),
    lane,
    status: "idle",
    steps: buildSteps(),
    currentStep: -1,
    token: freshToken(1),
    actions: [],
    metrics: {
      silentRetries: 0,
      reconsents: 0,
      restarts: 0,
      leaseRotations: 0,
      resumes: 0,
      deduplicatedActions: 0,
      staleTokenReuses: 0,
      completedSteps: 0,
    },
  };
}

// --- event helpers ----------------------------------------------------------

function pushRun(sessionId: string, run: RunState) {
  emit(sessionId, { type: "run", lane: run.lane, run: structuredClone(run) });
}
function log(
  sessionId: string,
  lane: Lane,
  level: "info" | "warn" | "error" | "good",
  tag: string,
  message: string,
) {
  emit(sessionId, { type: "log", lane, level, tag, message, at: Date.now() });
}

// --- public API -------------------------------------------------------------

export function startSession(
  failureStep: number,
  deathCode: string = "AADSTS700082",
  workspaceId?: string,
): SessionState {
  const baseline = newRun("baseline");
  const revive = newRun("revive");
  const session: SessionState = {
    id: rid("sess_"),
    workspaceId,
    failureStep,
    deathCode,
    createdAt: Date.now(),
    baseline,
    revive,
  };
  putSession(session);
  emit(session.id, { type: "snapshot", session: structuredClone(session) });

  // Kick off both lanes concurrently; do not await because they run in the background.
  void executeFrom(session.id, "baseline", 0, false);
  void executeFrom(session.id, "revive", 0, false);

  return session;
}

/**
 * Called out-of-band by the re-consent page when the human approves.
 * Validates synchronously, then runs mint → splice → resume in the background
 * so the HTTP response returns immediately.
 */
export async function approveReconsent(ticketId: string, context: { connectionId?: string } = {}): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const session = sessionForTicket(ticketId);
  if (!session) return { ok: false, reason: "no such ticket" };
  const run = session.revive;
  if (run.status !== "awaiting_reconsent" || !run.checkpoint || !run.ticket) {
    return { ok: false, reason: "run is not awaiting re-consent" };
  }
  if (run.ticket.id !== ticketId) return { ok: false, reason: "stale ticket" };
  if (Date.now() >= run.ticket.expiresAt) {
    run.ticket.status = "expired";
    run.recoveryCase && (run.recoveryCase.status = "expired");
    pushRun(session.id, run);
    return { ok: false, reason: "ticket expired" };
  }

  // mark approved immediately so a double-click can't re-trigger
  run.ticket.status = "approved";
  run.status = "resuming";
  if (run.recoveryCase) {
    run.recoveryCase.status = "reauthorized";
    run.recoveryCase.updatedAt = Date.now();
  }
  pushRun(session.id, run);
  void enqueueWebhookEvent("recovery.reauthorized", {
    recoveryCaseId: run.recoveryCase?.id,
    runId: run.id,
    provider: run.ticket.provider,
    generation: run.token.generation + 1,
    connectionId: context.connectionId,
  });
  // Await the resume so the run reaches completion before this returns. On a
  // serverless host the instance can freeze the moment the response is sent, so
  // a fire-and-forget resume would never finish. Flush the final state durably
  // so any instance can read the completed run afterward.
  await runResume(session);
  await flushSession(session);
  return { ok: true };
}

async function runResume(session: SessionState) {
  const run = session.revive;
  if (!run.checkpoint) return;
  const cp = run.checkpoint;

  // (4a) rotate the opaque credential lease to a new fencing generation.
  const gen = run.token.generation + 1;
  run.token.state = "rotating";
  pushRun(session.id, run);
  run.token = freshToken(gen, run.token.leaseId);
  run.metrics.reconsents += 1;
  log(session.id, "revive", "good", "consent", `Re-consent approved by ${ACCOUNT}`);
  log(
    session.id,
    "revive",
    "good",
    "mint",
    `Fresh refresh+access token minted · generation ${gen} · ${run.token.fingerprint}`,
  );
  pushRun(session.id, run);
  await sleep(620);

  // (4b) resume the same logical run. A production worker may be a different
  // process; the lease generation fences stale workers out.
  run.metrics.leaseRotations += 1;
  run.metrics.resumes += 1;
  run.status = "resuming";
  const step = run.steps[cp.stepIndex];
  step.status = "resuming";
  step.note = `credential lease advanced to generation ${run.token.generation}`;
  if (run.recoveryCase) {
    run.recoveryCase.status = "resuming";
    run.recoveryCase.updatedAt = Date.now();
  }
  log(
    session.id,
    "revive",
    "good",
    "rotate",
    `Credential lease rotated · generation ${gen} · stale workers fenced`,
  );
  log(
    session.id,
    "revive",
    "good",
    "resume",
    `Resuming step ${cp.stepIndex + 1} (${cp.stepId}) from checkpoint`,
  );
  pushRun(session.id, run);
  await sleep(640);

  // resume the exact step with a healthy token
  await executeFrom(session.id, "revive", cp.stepIndex, true);
}

// --- the run loop -----------------------------------------------------------

async function executeFrom(
  sessionId: string,
  lane: Lane,
  startIndex: number,
  tokenHealthy: boolean,
) {
  const session = getSession(sessionId);
  if (!session) return;
  const run = session[lane];

  if (startIndex === 0) {
    run.status = "running";
    run.startedAt = Date.now();
    log(
      sessionId,
      lane,
      "info",
      "start",
      `Nightly Exec Briefing: ${run.steps.length} steps · ${ACCOUNT}`,
    );
  }

  for (let i = startIndex; i < run.steps.length; i++) {
    const step = run.steps[i];
    run.currentStep = i;
    run.status = "running";
    step.status = "running";
    step.startedAt = Date.now();
    const action = prepareAction(run, step);
    pushRun(sessionId, run);
    log(sessionId, lane, "info", "call", `→ ${step.method} ${step.path}`);
    await sleep(BASE_DELAY);

    const mustRefresh = i === session.failureStep && !tokenHealthy;
    if (mustRefresh) {
      // The hourly access token has lapsed; attempt the silent refresh that, in
      // the real incidents, finally exercises the days-old dead refresh token.
      step.status = "refreshing";
      step.attempts = (step.attempts ?? 0) + 1;
      pushRun(sessionId, run);
      log(
        sessionId,
        lane,
        "warn",
        "auth",
        `Access token expired. Attempting silent refresh`,
      );
      await sleep(560);

      const res = tokenEndpoint({
        provider: PROVIDER,
        refreshTokenDead: true,
        deathCode: session.deathCode ?? "AADSTS700082",
        scopes: SCOPES,
        generation: run.token.generation,
      });

      if (!res.ok) {
        log(
          sessionId,
          lane,
          "error",
          "token",
          `POST /oauth2/v2.0/token → 400 ${res.error.error}`,
        );

        if (lane === "baseline") {
          // No sidecar: the framework has no classifier and no re-consent path.
          await sleep(360);
          await baselineStall(sessionId, i);
        } else {
          // Revive: classify the error against the recovery corpus, then park.
          const verdict = classify(res.error);
          run.classifier = verdict;
          log(
            sessionId,
            lane,
            verdict.verdict === "dead" ? "error" : "warn",
            "classify",
            `Verdict: ${verdict.verdict.toUpperCase()} · ${verdict.code} · ${verdict.title} · conf ${(verdict.confidence * 100) | 0}%`,
          );
          pushRun(sessionId, run);
          await sleep(420);
          await revivePark(sessionId, i, verdict);
        }
        return; // stop here; revive resumes out-of-band
      }
    }

    // success path
    step.status = "ok";
    step.endedAt = Date.now();
    if (action) {
      action.state = "committed";
      action.updatedAt = Date.now();
      log(
        sessionId,
        lane,
        "good",
        "commit",
        `Action committed once · ${action.idempotencyKey}`,
      );
    }
    run.metrics.completedSteps += 1;
    pushRun(sessionId, run);
    log(sessionId, lane, "good", "ok", `200 OK · ${step.detail}`);
    await sleep(BASE_DELAY * 0.42);
  }

  run.status = "completed";
  run.endedAt = Date.now();
  if (run.checkpoint) {
    run.metrics.recoveredMs = Date.now() - run.checkpoint.takenAt;
  }
  if (run.recoveryCase) {
    run.recoveryCase.status = "recovered";
    run.recoveryCase.updatedAt = Date.now();
    run.recoveryCase.resolvedAt = Date.now();
  }
  pushRun(sessionId, run);
  if (run.recoveryCase) {
    void enqueueWebhookEvent("recovery.recovered", {
      recoveryCaseId: run.recoveryCase.id,
      runId: run.id,
      recoveredMs: run.metrics.recoveredMs,
      generation: run.token.generation,
    });
  }
  log(
    sessionId,
    lane,
    "good",
    "done",
    `Run completed · ${run.metrics.completedSteps}/${run.steps.length} steps · briefing delivered`,
  );
  settleIfDone(sessionId);
}

// --- baseline: the bug ------------------------------------------------------

async function baselineStall(sessionId: string, stepIndex: number) {
  const session = getSession(sessionId)!;
  const run = session.baseline;
  const step = run.steps[stepIndex];
  const stale = run.token.fingerprint;

  run.status = "stalled";
  step.status = "failed";
  pushRun(sessionId, run);
  log(
    sessionId,
    "baseline",
    "warn",
    "noop",
    `No re-consent path. Falling back to cached access token`,
  );

  for (let a = 1; a <= MAX_BASELINE_RETRIES; a++) {
    await sleep(680);
    run.metrics.silentRetries += 1;
    step.attempts = (step.attempts ?? 0) + 1;
    pushRun(sessionId, run);
    log(
      sessionId,
      "baseline",
      "warn",
      "retry",
      `Silent refresh #${a} failed again. Reusing cached token ${stale} (stale)`,
    );
    await sleep(520);
    run.metrics.staleTokenReuses += 1;
    const g401 = graphResourceUnauthorized(PROVIDER);
    pushRun(sessionId, run);
    log(
      sessionId,
      "baseline",
      "error",
      "401",
      `${step.method} ${step.path} → 401 ${g401.graphError!.code}`,
    );
  }

  step.note = "logging back in doesn't fix the running agent; it keeps using the dead token";
  run.status = "dead";
  run.endedAt = Date.now();
  pushRun(sessionId, run);
  const remaining = run.steps.length - stepIndex;
  log(
    sessionId,
    "baseline",
    "error",
    "abandon",
    `Run abandoned at step ${stepIndex + 1}/${run.steps.length}. ${remaining} steps never ran. Manual restart required.`,
  );
  settleIfDone(sessionId);
}

// --- revive: the fix --------------------------------------------------------

async function revivePark(
  sessionId: string,
  stepIndex: number,
  verdict: ClassifierResult,
) {
  const session = getSession(sessionId)!;
  const run = session.revive;
  const step = run.steps[stepIndex];

  // (2) step-accurate durable checkpoint, captured the instant the token died
  run.checkpoint = {
    runId: run.id,
    takenAt: Date.now(),
    stepIndex,
    stepId: step.id,
    cursor: {
      pendingCall: `${step.method} ${step.path}`,
      completedSteps: stepIndex,
      retryOf: null,
    },
    tokenFingerprint: run.token.fingerprint,
    scopes: run.token.scopes,
  };
  step.status = "checkpointed";
  run.status = "awaiting_reconsent";
  const now = Date.now();
  run.recoveryCase = {
    id: rid("rcv_"),
    runId: run.id,
    provider: PROVIDER,
    credentialLeaseId: run.token.leaseId,
    failedStepId: step.id,
    status: "parked",
    causeCode: verdict.code,
    policy:
      verdict.code === "AADSTS50076" || verdict.code === "AADSTS50078"
        ? "step_up"
        : "interactive_reauth",
    openedAt: now,
    updatedAt: now,
  };
  pushRun(sessionId, run);
  log(
    sessionId,
    "revive",
    "good",
    "checkpoint",
    `Durable checkpoint captured. Step ${stepIndex + 1} (${step.id}) frozen mid-flight`,
  );
  await sleep(520);

  // (3) URL-mode re-consent elicitation (MCP spec 2025-11-25)
  const ticket: ReconsentTicket = {
    id: `tkt_${crypto.randomBytes(32).toString("base64url")}`,
    runId: run.id,
    sessionId,
    provider: PROVIDER,
    account: ACCOUNT,
    scopes: run.token.scopes,
    url: "",
    reason: `${verdict.code}: ${verdict.title}`,
    code: verdict.code,
    createdAt: Date.now(),
    expiresAt: Date.now() + 15 * 60 * 1000,
    status: "open",
  };
  ticket.url = `/reauthorize/${ticket.id}`;
  run.ticket = ticket;
  run.recoveryCase.status = "awaiting_user";
  run.recoveryCase.updatedAt = Date.now();
  try {
    await registerTicket(ticket.id, sessionId);
  } catch {
    run.ticket = undefined;
    run.status = "stalled";
    run.recoveryCase.status = "expired";
    run.recoveryCase.updatedAt = Date.now();
    pushRun(sessionId, run);
    log(sessionId, "revive", "error", "persist", "Recovery link could not be published. Durable storage rejected the ticket.");
    return;
  }
  // Publish the link only after the session and lookup row are durable.
  pushRun(sessionId, run);
  void enqueueWebhookEvent("recovery.parked", {
    recoveryCaseId: run.recoveryCase.id,
    runId: run.id,
    ticketId: ticket.id,
    provider: ticket.provider,
    causeCode: verdict.code,
    expiresAt: new Date(ticket.expiresAt).toISOString(),
  });
  log(sessionId, "revive", "info", "elicit", `URL-mode re-consent elicitation emitted`);
  log(sessionId, "revive", "info", "elicit", `↳ ${ticket.url}`);
  // now we wait; approveReconsent() resumes the run out of band
}

function prepareAction(run: RunState, step: RunState["steps"][number]) {
  if (step.method === "GET") return undefined;
  let action = run.actions.find((item) => item.stepId === step.id);
  if (!action) {
    const requestHash = crypto
      .createHash("sha256")
      .update(`${step.method}:${step.path}:${run.id}`)
      .digest("hex")
      .slice(0, 16);
    action = {
      id: rid("act_"),
      runId: run.id,
      stepId: step.id,
      requestHash,
      idempotencyKey: `rv_${run.id}_${step.id}`,
      state: "prepared",
      attempts: 0,
      updatedAt: Date.now(),
    };
    run.actions.push(action);
  }
  action.attempts += 1;
  action.updatedAt = Date.now();
  return action;
}

// --- session settle ---------------------------------------------------------

function settleIfDone(sessionId: string) {
  const s = getSession(sessionId);
  if (!s) return;
  const terminal = (st: string) => st === "completed" || st === "dead";
  if (terminal(s.baseline.status) && terminal(s.revive.status)) {
    emit(sessionId, { type: "done" });
  }
}
