import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { assertLeaseGeneration, listActions, registerAction, TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /v1/actions — register a protected action attempt (SDK contract:
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
        return NextResponse.json({ error: error.message, code: "stale_credential_generation" }, { status: error.status });
      }
      throw error;
    }
  }
  let action;
  try {
    action = await registerAction(auth.workspace.id, {
      runId, connectionId, actionKey, idempotencyKey,
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
  await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "action", subjectId: action.id, event: isFresh ? "registered" : "replayed", detail: { runId, actionKey, state: action.state, attempts: action.attempts } });
  return NextResponse.json({
    id: action.id,
    idempotencyKey: action.idempotencyKey,
    state: isFresh ? "new" : action.state === "started" ? "uncertain" : action.state,
    resultRef: action.resultRef,
    attempts: action.attempts,
  });
}

// GET /v1/actions — workspace action ledger.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ actions: (await listActions(auth.workspace.id)).slice(0, 200) });
}
