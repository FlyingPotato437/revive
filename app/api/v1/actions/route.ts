import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { actionApproval, assertLeaseGeneration, listActions, registerAction, setActionApproval, TransitionError } from "@/lib/control-plane";
import { evaluateApproval, getApprovalPolicy } from "@/lib/workspace-config";
import { notifyApprovalRequested } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { approvalSummary, normalizeRiskContext } from "@/lib/action-contracts";

export const dynamic = "force-dynamic";

// POST /v1/actions registers a protected action attempt (SDK contract:
// ReviveTransport.registerAction → { id, idempotencyKey }).
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const runId = String(body.runId || "").slice(0, 200);
  const connectionId = String(body.connectionId || "").slice(0, 200);
  const actionKey = String(body.actionKey || "").slice(0, 200);
  const idempotencyKey = String(body.idempotencyKey || "").slice(0, 200);
  if (!runId || !connectionId || !actionKey || !idempotencyKey) {
    return NextResponse.json(
      { error: "runId, connectionId, actionKey and idempotencyKey are required" },
      { status: 400 },
    );
  }
  // Hosted generation fencing: a worker holding an older credential lease is
  // rejected before it can attempt the side effect.
  if (typeof body.leaseGeneration === "number") {
    try {
      await assertLeaseGeneration(auth.workspace.id, connectionId, Math.floor(body.leaseGeneration));
    } catch (error) {
      if (error instanceof TransitionError) {
        return NextResponse.json(
          { error: error.message, code: "stale_credential_generation", replayVerdict: "blocked_stale_generation" },
          { status: error.status },
        );
      }
      throw error;
    }
  }
  // Reconcile hints: provider probe fields (subject / internetMessageId /
  // messageId) the SDK attaches so recovery can auto-answer "did this side
  // effect already happen?" before resume.
  let metadata: Record<string, unknown> | undefined;
  if (body.reconcileHints && typeof body.reconcileHints === "object") {
    const raw = body.reconcileHints as Record<string, unknown>;
    const hints: Record<string, unknown> = {};
    for (const field of ["provider", "subject", "internetMessageId", "messageId", "rfc822MessageId"] as const) {
      if (typeof raw[field] === "string") hints[field] = String(raw[field]).slice(0, 300);
    }
    if (typeof raw.windowMinutes === "number") hints.windowMinutes = raw.windowMinutes;
    if (Object.keys(hints).length) metadata = { reconcileHints: hints };
  }
  // Tool calls may share compact action facts, never raw arguments. This keeps
  // policy decisions useful (for example a 50-recipient send) without turning
  // the control plane into a store for message bodies or customer data.
  const riskContext = normalizeRiskContext(body.riskContext);
  if (riskContext) metadata = { ...metadata, riskContext };
  let action;
  try {
    action = await registerAction(auth.workspace.id, {
      projectId: auth.projectId, runId, connectionId, actionKey, idempotencyKey, metadata,
      checkpointId: body.checkpointId ? String(body.checkpointId).slice(0, 200) : undefined,
    });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  // Registration verdict: only a first-time registration is "new" and may
  // execute. Replays surface the ledger outcome so the SDK skips the side
  // effect (completed/reconciled) or reconciles first (uncertain).
  // "prepared" means the side effect has never been attempted, so both a
  // fresh registration and a replay of a prepared action are safe to execute.
  const isFresh = action.state === "prepared";
  // Approval gate. The caller opts into the gate (approvalMode:"auto", how the
  // MCP gateway registers every call); the WORKSPACE POLICY decides which
  // actions within that gate actually need a human. A caller can also force one
  // action with requireApproval:true. The approval lives on the action itself;
  // callers poll GET /v1/actions/:id until it is decided.
  let approval = actionApproval(action);
  const gateOptIn = body.approvalMode === "auto" || body.requireApproval === true;
  // Gate on "prepared + no approval yet" rather than attempts===1: two racing
  // registrations of the same key both see state=prepared with no approval, so
  // both create+return the pending approval instead of one slipping through as
  // safe_to_execute. A replay of an already-decided action keeps its approval
  // (actionApproval !== null) and is not re-created.
  const policyDecision = gateOptIn
    ? evaluateApproval(await getApprovalPolicy(auth.workspace.id), actionKey, riskContext)
    : { required: false, source: "off" as const, reason: "Approval gate was not requested by this client" };
  const needsApproval = isFresh && !approval && gateOptIn && (body.requireApproval === true || policyDecision.required);
  if (needsApproval) {
    approval = {
      status: "pending",
      requestedBy: auth.keyPrefix,
      requestedAt: Date.now(),
      // Never persist a caller-provided tool argument summary. The console only
      // gets the action key and compact, allowlisted risk facts.
      summary: approvalSummary(actionKey, riskContext),
    };
    action = await setActionApproval(auth.workspace.id, action.id, approval, auth.projectId);
    void notifyApprovalRequested({
      workspaceId: auth.workspace.id, actionId: action.id, actionKey, runId, summary: approval.summary,
    });
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "action", subjectId: action.id, event: "approval_requested", detail: { runId, actionKey, policySource: policyDecision.source, policyReason: policyDecision.reason } });
  }
  // Replay verdict is the direct answer to "should this exact external side
  // effect run again?": safe_to_execute (never attempted), already_committed
  // (result recorded; return it, do not re-run), reconcile_first (attempt
  // started but outcome unknown; check the provider before any retry).
  const replayVerdict = isFresh
    ? "safe_to_execute"
    : action.state === "completed" || action.state === "reconciled"
      ? "already_committed"
      : "reconcile_first";
  await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "action", subjectId: action.id, event: isFresh ? "registered" : "replayed", detail: { runId, actionKey, state: action.state, attempts: action.attempts, replayVerdict } });
  return NextResponse.json({
    id: action.id,
    idempotencyKey: action.idempotencyKey,
    state: isFresh ? "new" : action.state === "started" ? "uncertain" : action.state,
    replayVerdict,
    resultRef: action.resultRef,
    attempts: action.attempts,
    ...(approval ? { approval: { status: approval.status, requestedAt: approval.requestedAt, decidedBy: approval.decidedBy, reason: approval.reason } } : {}),
  });
}

// GET /v1/actions returns the workspace action ledger.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ actions: (await listActions(auth.workspace.id, auth.projectId)).slice(0, 200) });
}
