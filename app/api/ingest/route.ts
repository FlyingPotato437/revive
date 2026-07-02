import { NextRequest, NextResponse } from "next/server";
import { workspaceForApiKey } from "@/lib/workspaces";
import { getSession, putSession } from "@/lib/store";
import type { Provider, RecoveryStatus, RunState, RunStatus, SessionState } from "@/lib/types";

export const dynamic = "force-dynamic";

// SDK → console bridge. The sidecar reports recovery-case lifecycle events with
// a workspace API key; cases appear in Overview and Recovery cases alongside
// drills. Raw tokens are never accepted here — lifecycle metadata only.

type IngestEvent = "opened" | "parked" | "reauthorized" | "resumed" | "recovered" | "abandoned";

interface IngestBody {
  run_id?: string;
  event?: IngestEvent;
  provider?: string;
  cause_code?: string;
  failed_step?: string;
  steps_total?: number;
  steps_done?: number;
  recovered_ms?: number;
  lease_generation?: number;
  deduplicated_actions?: number;
  source?: string;
}

const RUN_STATUS: Record<IngestEvent, RunStatus> = {
  opened: "running",
  parked: "awaiting_reconsent",
  reauthorized: "resuming",
  resumed: "resuming",
  recovered: "completed",
  abandoned: "dead",
};

const CASE_STATUS: Record<IngestEvent, RecoveryStatus> = {
  opened: "detected",
  parked: "parked",
  reauthorized: "reauthorized",
  resumed: "resuming",
  recovered: "recovered",
  abandoned: "cancelled",
};

function emptyRun(lane: "baseline" | "revive", runId: string): RunState {
  return {
    id: runId,
    lane,
    status: "idle",
    steps: [],
    currentStep: -1,
    token: { leaseId: "external", fingerprint: "external", issuedAt: Date.now(), scopes: [], generation: 1, state: "active" },
    actions: [],
    metrics: {
      silentRetries: 0, reconsents: 0, restarts: 0, leaseRotations: 0, resumes: 0,
      deduplicatedActions: 0, staleTokenReuses: 0, completedSteps: 0,
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const workspace = await workspaceForApiKey(key);
  if (!workspace) {
    return NextResponse.json({ error: "invalid or revoked API key" }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const runId = String(body.run_id || "").slice(0, 120);
  const event = body.event;
  if (!runId || !event || !(event in RUN_STATUS)) {
    return NextResponse.json(
      { error: "run_id and event (opened|parked|reauthorized|resumed|recovered|abandoned) are required" },
      { status: 400 },
    );
  }

  const sessionId = `ext_${workspace.id}_${runId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const now = Date.now();
  const provider = (body.provider === "google" ? "google" : "microsoft") as Provider;

  let session = getSession(sessionId);
  if (!session) {
    const revive = emptyRun("revive", runId);
    revive.startedAt = now;
    session = {
      id: sessionId,
      workspaceId: workspace.id,
      failureStep: -1,
      deathCode: body.cause_code,
      createdAt: now,
      baseline: emptyRun("baseline", `${runId}_baseline`),
      revive,
    } satisfies SessionState;
  }

  const run = session.revive;
  run.status = RUN_STATUS[event];
  if (body.cause_code) session.deathCode = String(body.cause_code).slice(0, 60);
  if (typeof body.steps_done === "number") run.metrics.completedSteps = Math.max(0, Math.floor(body.steps_done));
  if (typeof body.recovered_ms === "number") run.metrics.recoveredMs = Math.max(0, body.recovered_ms);
  if (typeof body.lease_generation === "number") run.token.generation = Math.max(1, Math.floor(body.lease_generation));
  if (typeof body.deduplicated_actions === "number") run.metrics.deduplicatedActions = Math.max(0, Math.floor(body.deduplicated_actions));
  if (event === "reauthorized") run.metrics.reconsents += 1;
  if (event === "resumed") run.metrics.resumes += 1;
  if (event === "recovered" || event === "abandoned") run.endedAt = now;
  if (typeof body.steps_total === "number" && body.steps_total > 0 && run.steps.length === 0) {
    run.steps = Array.from({ length: Math.min(64, Math.floor(body.steps_total)) }, (_, index) => ({
      id: `step_${index + 1}`, method: "GET" as const, path: "external", label: `Step ${index + 1}`,
      detail: body.source || "reported by sidecar", status: "pending" as const,
    }));
  }

  const existing = session.revive.recoveryCase;
  session.revive.recoveryCase = {
    id: existing?.id || `case_${sessionId.slice(-12)}`,
    runId,
    provider,
    credentialLeaseId: existing?.credentialLeaseId || "external",
    failedStepId: body.failed_step || existing?.failedStepId || "unknown",
    status: CASE_STATUS[event],
    causeCode: body.cause_code || existing?.causeCode || "unreported",
    policy: existing?.policy || "interactive_reauth",
    openedAt: existing?.openedAt || now,
    updatedAt: now,
    resolvedAt: event === "recovered" || event === "abandoned" ? now : existing?.resolvedAt,
  };

  putSession(session);
  return NextResponse.json({
    ok: true,
    session_id: sessionId,
    case_id: session.revive.recoveryCase.id,
    status: session.revive.recoveryCase.status,
  });
}
