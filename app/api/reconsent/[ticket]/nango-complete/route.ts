import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { advanceLease, transition, TransitionError } from "@/lib/control-plane";
import { loadConnectionBinding, saveExternalVaultConnection } from "@/lib/hosted";
import { allowedNangoIntegrations, fetchNangoMicrosoftIdentity, MICROSOFT_GRAPH_RECOVERY_SCOPES } from "@/lib/integrations/nango";
import { resolveRecoveryTarget } from "@/lib/recovery-target";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enqueueRuntimeResume } from "@/lib/webhooks";
import { autoReconcileRun } from "@/lib/auto-reconcile";

// Wrong-account recovery attempts get a structured, user-explainable block
// instead of a generic 409 — the recovery page renders it as "wrong account".
class IdentityMismatchError extends Error {
  constructor(message: string, readonly boundAccount?: string) {
    super(message);
    this.name = "IdentityMismatchError";
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticket: string }> }) {
  const limited = await enforceRateLimit(req, "nango:recovery-complete", 12, 60);
  if (limited) return limited;
  const { ticket } = await params;
  const target = await resolveRecoveryTarget(ticket);
  if (!target) return NextResponse.json({ error: "recovery request is inactive" }, { status: 410 });
  if (target.kind !== "control") {
    return NextResponse.json({ error: "Nango completion is available for hosted recovery cases" }, { status: 409 });
  }
  try {
    const body = await req.json() as { connectionId?: string; integrationId?: string };
    const connectionId = String(body.connectionId || "");
    const integrationId = String(body.integrationId || "");
    if (connectionId !== target.record.connectionId) {
      return NextResponse.json({ error: "the authorized Nango connection does not match this recovery case" }, { status: 409 });
    }
    if (!allowedNangoIntegrations().includes(integrationId)) {
      return NextResponse.json({ error: "the Nango integration is not allowlisted" }, { status: 400 });
    }

    const identity = await fetchNangoMicrosoftIdentity({ integrationId, connectionId });
    const expected = await loadConnectionBinding(connectionId, target.record.workspaceId);
    if (!expected?.subject || !expected.tenant) {
      if (process.env.NODE_ENV === "production" && process.env.REVIVE_ALLOW_FIRST_USE_BINDING !== "true") {
        throw new Error("the connection is missing its creation-time identity binding");
      }
    } else {
      if (expected.subject !== identity.subject) {
        throw new IdentityMismatchError("the authorized Microsoft account does not match the account bound to this connection", expected.accountId);
      }
      if (expected.tenant !== identity.tenant) {
        throw new IdentityMismatchError("the authorized Microsoft tenant does not match the tenant bound to this connection", expected.accountId);
      }
    }

    await saveExternalVaultConnection({
      id: connectionId,
      workspaceId: target.record.workspaceId,
      provider: "microsoft",
      accountId: identity.accountId,
      scopes: [...new Set([...(expected?.scopes || []), ...MICROSOFT_GRAPH_RECOVERY_SCOPES])],
      vault: "nango",
      integrationId,
      providerSubject: identity.subject,
      providerTenant: identity.tenant,
      displayName: identity.displayName,
    });

    let record = target.record;
    if (record.state === "parked") {
      record = await transition(record.workspaceId, record.id, {
        to: "awaiting_authorization", expectedVersion: record.version, actor: "nango-connect",
      });
    }
    if (record.state !== "awaiting_authorization") {
      return NextResponse.json({ error: `recovery case cannot verify identity from ${record.state}` }, { status: 409 });
    }
    record = await transition(record.workspaceId, record.id, {
      to: "identity_verified",
      expectedVersion: record.version,
      actor: "nango-connect",
      note: `Microsoft subject ${identity.subject}`,
    });
    const generation = await advanceLease(record.workspaceId, record.connectionId);
    // Auto-reconciliation BEFORE resume: settle every unknown-outcome action of
    // this run against the provider, so the runtime resumes into a ledger of
    // known verdicts — never a blind retry of something that already committed.
    const reconciliation = await autoReconcileRun({
      workspaceId: record.workspaceId,
      runId: record.runId,
      connectionId: record.connectionId,
      integrationId,
      actor: "nango-connect",
    });
    const resumeJobId = await enqueueRuntimeResume(record, generation);
    await audit({
      workspaceId: record.workspaceId,
      actor: "nango-connect",
      subjectKind: "auth",
      subjectId: record.id,
      event: expected?.subject ? "identity_verified" : "identity_bound_first_use",
      detail: { connectionId, integrationId, tenant: identity.tenant, generation, resumeJobId },
    });
    return NextResponse.json({
      ok: true,
      caseId: record.id,
      state: record.state,
      generation,
      accountId: identity.accountId,
      reconciliation,
      resumeQueued: Boolean(resumeJobId),
      resumeJobId,
    });
  } catch (error) {
    if (error instanceof IdentityMismatchError) {
      await audit({
        workspaceId: target.record.workspaceId,
        actor: "nango-connect",
        subjectKind: "auth",
        subjectId: target.record.id,
        event: "identity_mismatch_blocked",
        detail: { reason: error.message, boundAccount: error.boundAccount },
      });
      return NextResponse.json(
        { ok: false, code: "identity_mismatch", reason: error.message, boundAccount: error.boundAccount },
        { status: 403 },
      );
    }
    const status = error instanceof TransitionError ? error.status : 409;
    await audit({
      workspaceId: target.record.workspaceId,
      actor: "nango-connect",
      subjectKind: "auth",
      subjectId: target.record.id,
      event: "identity_verification_failed",
      detail: { reason: error instanceof Error ? error.message : "unknown error" },
    });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nango verification failed" }, { status });
  }
}
