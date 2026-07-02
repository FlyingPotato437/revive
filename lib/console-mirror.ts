// Mirrors control-plane cases into the console session store so Overview and
// Recovery cases render hosted-API activity without a second read path.
import { getSession, putSession } from "./store";
import type { ControlCase } from "./control-plane";
import type { Provider, RecoveryStatus, RunState, RunStatus, SessionState } from "./types";

const RUN_STATUS: Partial<Record<ControlCase["state"], RunStatus>> = {
  detected: "running",
  classified: "running",
  parked: "awaiting_reconsent",
  awaiting_authorization: "awaiting_reconsent",
  identity_verified: "resuming",
  resumed: "resuming",
  reconciled: "resuming",
  completed: "completed",
  rejected: "dead",
  expired: "dead",
  escalated: "dead",
  manual_review: "awaiting_reconsent",
};

const CASE_STATUS: Partial<Record<ControlCase["state"], RecoveryStatus>> = {
  detected: "detected",
  classified: "detected",
  parked: "parked",
  awaiting_authorization: "awaiting_user",
  identity_verified: "reauthorized",
  resumed: "resuming",
  reconciled: "resuming",
  completed: "recovered",
  rejected: "cancelled",
  expired: "expired",
  escalated: "cancelled",
  manual_review: "awaiting_user",
};

function emptyRun(lane: "baseline" | "revive", runId: string): RunState {
  return {
    id: runId, lane, status: "idle", steps: [], currentStep: -1,
    token: { leaseId: "external", fingerprint: "external", issuedAt: Date.now(), scopes: [], generation: 1, state: "active" },
    actions: [],
    metrics: {
      silentRetries: 0, reconsents: 0, restarts: 0, leaseRotations: 0, resumes: 0,
      deduplicatedActions: 0, staleTokenReuses: 0, completedSteps: 0,
    },
  };
}

export function mirrorCaseToConsole(record: ControlCase): void {
  const sessionId = `cp_${record.id}`;
  let session = getSession(sessionId);
  if (!session) {
    const revive = emptyRun("revive", record.runId);
    revive.startedAt = record.openedAt;
    session = {
      id: sessionId,
      workspaceId: record.workspaceId,
      failureStep: -1,
      deathCode: undefined,
      createdAt: record.openedAt,
      baseline: emptyRun("baseline", `${record.runId}_baseline`),
      revive,
    } satisfies SessionState;
  }
  const run = session.revive;
  run.status = RUN_STATUS[record.state] || "running";
  if (typeof record.leaseGeneration === "number") run.token.generation = Math.max(1, record.leaseGeneration);
  if (record.state === "completed") run.endedAt = record.resolvedAt || Date.now();
  session.revive.recoveryCase = {
    id: record.id,
    runId: record.runId,
    provider: (record.provider === "google" ? "google" : "microsoft") as Provider,
    credentialLeaseId: record.connectionId,
    failedStepId: record.actionKey,
    status: CASE_STATUS[record.state] || "detected",
    causeCode: record.reason.slice(0, 60),
    policy: record.policy === "manual_reconcile" ? "retry" : record.policy,
    openedAt: record.openedAt,
    updatedAt: record.updatedAt,
    resolvedAt: record.resolvedAt,
    events: record.events,
  };
  putSession(session);
}
