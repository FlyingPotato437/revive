import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { rotateLease, transition, TransitionError } from "@/lib/control-plane";
import { loadConnectionBinding, saveExternalVaultConnection } from "@/lib/hosted";
import { allowedNangoIntegrations, fetchNangoMicrosoftIdentity } from "@/lib/integrations/nango";
import { resolveRecoveryTarget } from "@/lib/recovery-target";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enqueueRuntimeResume } from "@/lib/webhooks";

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
      if (expected.subject !== identity.subject) throw new Error("the authorized Microsoft account does not match this connection");
      if (expected.tenant !== identity.tenant) throw new Error("the authorized Microsoft tenant does not match this connection");
    }

    await saveExternalVaultConnection({
      id: connectionId,
      workspaceId: target.record.workspaceId,
      provider: "microsoft",
      accountId: identity.accountId,
      scopes: expected?.scopes?.length ? expected.scopes : ["offline_access", "User.Read", "Mail.ReadWrite"],
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
    const generation = await rotateLease(record.workspaceId, record.connectionId, record.leaseGeneration ?? 1);
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
      resumeQueued: Boolean(resumeJobId),
      resumeJobId,
    });
  } catch (error) {
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
