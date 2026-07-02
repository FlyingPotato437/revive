import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { listCases, openCase, transition } from "@/lib/control-plane";
import { mirrorCaseToConsole } from "@/lib/console-mirror";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /v1/recovery-cases — SDK contract: ReviveTransport.openRecoveryCase.
// Opens (or returns the still-open) case for run+action and advances it
// detected → classified → parked, since the SDK only calls this after it has
// already classified the failure and parked the run.
export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const required = ["runId", "connectionId", "actionKey", "idempotencyKey", "policy", "reason"] as const;
  for (const field of required) {
    if (!body[field]) return NextResponse.json({ error: `${field} is required` }, { status: 400 });
  }
  const policy = String(body.policy);
  if (!["interactive_reauth", "step_up", "retry", "manual_reconcile"].includes(policy)) {
    return NextResponse.json({ error: "invalid policy" }, { status: 400 });
  }
  let record = await openCase(auth.workspace.id, {
    runId: String(body.runId).slice(0, 200),
    checkpointId: body.checkpointId ? String(body.checkpointId).slice(0, 200) : undefined,
    connectionId: String(body.connectionId).slice(0, 200),
    actionKey: String(body.actionKey).slice(0, 200),
    idempotencyKey: String(body.idempotencyKey).slice(0, 200),
    provider: body.provider ? String(body.provider).slice(0, 40) : undefined,
    reason: String(body.reason),
    policy: policy as "interactive_reauth",
    leaseGeneration: typeof body.leaseGeneration === "number" ? body.leaseGeneration : undefined,
    actor: auth.keyPrefix,
  });
  // Advance a freshly opened case to parked; re-opened cases keep their state.
  if (record.state === "detected") {
    record = await transition(auth.workspace.id, record.id, { to: "classified", expectedVersion: record.version, actor: auth.keyPrefix, note: record.reason.slice(0, 120) });
    record = await transition(auth.workspace.id, record.id, { to: "parked", expectedVersion: record.version, actor: auth.keyPrefix });
  }
  mirrorCaseToConsole(record);
  await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "case", subjectId: record.id, event: "opened", detail: { runId: record.runId, state: record.state, reason: record.reason.slice(0, 120) } });
  return NextResponse.json({
    id: record.id,
    runId: record.runId,
    checkpointId: record.checkpointId,
    connectionId: record.connectionId,
    actionKey: record.actionKey,
    idempotencyKey: record.idempotencyKey,
    provider: record.provider,
    policy: record.policy,
    reason: record.reason,
    url: record.url,
    leaseGeneration: record.leaseGeneration,
    state: record.state,
    version: record.version,
  });
}

// GET /v1/recovery-cases?open=1 — workspace case queue.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const open = req.nextUrl.searchParams.get("open") === "1";
  return NextResponse.json({ cases: (await listCases(auth.workspace.id, { open })).slice(0, 200) });
}
