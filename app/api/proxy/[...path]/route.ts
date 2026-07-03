import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import {
  assertLeaseGeneration, completeAction, openCase, registerAction, startAction, transition, TransitionError,
} from "@/lib/control-plane";
import { classifyToolFailure } from "@/lib/failure-classifier";
import { evaluatePolicy } from "@/lib/policy";
import { allowedNangoIntegrations, nangoProxy } from "@/lib/integrations/nango";
import { mirrorCaseToConsole } from "@/lib/console-mirror";
import { audit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyCaseOpened } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Revive proxy mode: point the agent's tool base URL here instead of the
// provider, and the ledger becomes automatic. One base-URL change replaces
// SDK-wrapping every action:
//
//   POST $REVIVE_URL/api/proxy/v1.0/me/sendMail
//   Authorization: Bearer rv_live_…
//   X-Revive-Connection-Id: <nango connection>
//   X-Revive-Run-Id: <logical run>            (required for mutations)
//   X-Revive-Checkpoint-Id: <checkpoint>      (optional)
//   X-Revive-Action-Key: send_followup_email  (optional; derived otherwise)
//   X-Revive-Idempotency-Key: …               (optional; derived otherwise)
//   X-Revive-Lease-Generation: 2              (optional; fences stale workers)
//
// Reads pass straight through. Mutations are registered before dispatch:
//   already committed → stored result, no provider call (X-Revive-Replay: blocked)
//   outcome unknown   → 409 reconcile_first, no provider call
//   stale generation  → 409 blocked_stale_generation, no provider call
//   credential dead   → recovery case opened, 401 + recovery URL
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_STORED_RESULT = 32_768;

async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const limited = await enforceRateLimit(req, "proxy", 240, 60);
  if (limited) return limited;
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const workspaceId = auth.workspace.id;

  const { path } = await params;
  const providerPath = `/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const connectionId = String(req.headers.get("x-revive-connection-id") || "").slice(0, 200);
  const integrationId = String(req.headers.get("x-revive-integration-id") || allowedNangoIntegrations()[0] || "");
  if (!connectionId) return NextResponse.json({ error: "X-Revive-Connection-Id header is required" }, { status: 400 });
  if (!allowedNangoIntegrations().includes(integrationId)) {
    return NextResponse.json({ error: "the integration is not allowlisted" }, { status: 400 });
  }

  const method = req.method.toUpperCase();
  const body = MUTATING.has(method) ? await req.text() : undefined;

  // Reads pass through: no side effect, no ledger entry.
  if (!MUTATING.has(method)) {
    const upstream = await nangoProxy({ integrationId, connectionId, path: providerPath, method });
    return relay(upstream, { "x-revive-ledger": "read_passthrough" });
  }

  const runId = String(req.headers.get("x-revive-run-id") || "").slice(0, 200);
  if (!runId) return NextResponse.json({ error: "X-Revive-Run-Id header is required for mutating calls" }, { status: 400 });
  const checkpointId = String(req.headers.get("x-revive-checkpoint-id") || "").slice(0, 200) || undefined;
  const actionKey = (String(req.headers.get("x-revive-action-key") || "").slice(0, 200)
    || `${method.toLowerCase()}:${path.join("/")}`).slice(0, 200);
  // Body participates in the derived key so two DIFFERENT payloads to the same
  // endpoint in one run are two actions, while a retry of the same payload dedupes.
  const idempotencyKey = String(req.headers.get("x-revive-idempotency-key") || "").slice(0, 200)
    || crypto.createHash("sha256").update(`${runId}:${checkpointId || ""}:${actionKey}:${body || ""}`).digest("base64url");

  // Generation fencing before anything else.
  const generationHeader = req.headers.get("x-revive-lease-generation");
  if (generationHeader !== null) {
    try {
      await assertLeaseGeneration(workspaceId, connectionId, Math.floor(Number(generationHeader)));
    } catch (error) {
      if (error instanceof TransitionError) {
        return NextResponse.json({ error: error.message, replayVerdict: "blocked_stale_generation" }, { status: error.status });
      }
      throw error;
    }
  }

  const action = await registerAction(workspaceId, { runId, checkpointId, connectionId, actionKey, idempotencyKey });
  if (action.state === "completed" || action.state === "reconciled") {
    await audit({ workspaceId, actor: auth.keyPrefix, subjectKind: "action", subjectId: action.id, event: "proxy_replay_blocked", detail: { actionKey, runId } });
    return new NextResponse(action.resultRef ?? "{}", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-revive-replay": "blocked",
        "x-revive-action-id": action.id,
        "x-revive-verdict": "already_committed",
      },
    });
  }
  if (action.state === "started" || action.state === "uncertain") {
    return NextResponse.json(
      { error: "a previous attempt may have committed; reconcile before replaying", actionId: action.id, replayVerdict: "reconcile_first" },
      { status: 409, headers: { "x-revive-action-id": action.id, "x-revive-verdict": "reconcile_first" } },
    );
  }

  await startAction(workspaceId, action.id);
  let upstream: Response;
  try {
    upstream = await nangoProxy({ integrationId, connectionId, path: providerPath, method, body: body ? JSON.parse(body) : undefined });
  } catch (error) {
    // Network failure after dispatch: the ledger keeps the action started, so
    // the next attempt is forced through reconciliation instead of a blind retry.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "provider unreachable", actionId: action.id, replayVerdict: "reconcile_first" },
      { status: 502, headers: { "x-revive-action-id": action.id } },
    );
  }

  if (upstream.status === 401 || upstream.status === 403) {
    const detail = await upstream.text();
    const failure = classifyToolFailure({ status: upstream.status, message: detail.slice(0, 300) });
    const decision = evaluatePolicy({ actionKey, failureClass: failure.failureClass, mutationDispatched: false });
    let record = await openCase(workspaceId, {
      runId, checkpointId, connectionId, actionKey, idempotencyKey,
      provider: "microsoft", reason: `${failure.code || upstream.status}: ${detail.slice(0, 200)}`,
      policy: "interactive_reauth", actor: auth.keyPrefix,
    });
    if (record.state === "detected") {
      record = await transition(workspaceId, record.id, { to: "classified", expectedVersion: record.version, actor: auth.keyPrefix, note: `${failure.failureClass} → ${decision.decision}`.slice(0, 120) });
      record = await transition(workspaceId, record.id, { to: "parked", expectedVersion: record.version, actor: auth.keyPrefix });
      void notifyCaseOpened(record);
    }
    mirrorCaseToConsole(record);
    await audit({ workspaceId, actor: auth.keyPrefix, subjectKind: "case", subjectId: record.id, event: "opened", detail: { via: "proxy", actionKey, failureClass: failure.failureClass, resumeDecision: decision.decision } });
    return NextResponse.json(
      { error: "credential rejected; recovery case opened", caseId: record.id, recoveryUrl: record.url, failureClass: failure.failureClass, resumeDecision: decision.decision, actionId: action.id },
      { status: 401, headers: { "x-revive-case-id": record.id, "x-revive-action-id": action.id } },
    );
  }

  const responseText = await upstream.text();
  if (upstream.ok) {
    const resultRef = responseText.length <= MAX_STORED_RESULT ? (responseText || "{}") : JSON.stringify({ truncated: true, bytes: responseText.length });
    await completeAction(workspaceId, action.id, resultRef);
    await audit({ workspaceId, actor: auth.keyPrefix, subjectKind: "action", subjectId: action.id, event: "proxy_committed", detail: { actionKey, runId, status: upstream.status } });
  }
  // Non-auth provider errors (4xx/5xx) leave the action started: outcome is
  // unknown until reconciliation, which is exactly what the verdict enforces.
  return relay(upstream, {
    "x-revive-action-id": action.id,
    "x-revive-ledger": upstream.ok ? "committed" : "uncertain",
  }, responseText);
}

function relay(upstream: Response, extra: Record<string, string>, bodyText?: string): NextResponse {
  const headers = new Headers(extra);
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  return new NextResponse(bodyText ?? upstream.body, { status: upstream.status, headers });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD };
