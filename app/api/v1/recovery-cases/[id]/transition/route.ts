import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { advanceLease, transition, TransitionError, type CaseState } from "@/lib/control-plane";
import { mirrorCaseToConsole } from "@/lib/console-mirror";
import { audit } from "@/lib/audit";
import { enqueueRuntimeResume } from "@/lib/webhooks";
import { autoReconcileRun } from "@/lib/auto-reconcile";
import { allowedNangoIntegrations } from "@/lib/integrations/nango";
import { loadConnectionBinding } from "@/lib/hosted";

export const dynamic = "force-dynamic";

const STATES: CaseState[] = [
  "classified", "parked", "awaiting_authorization", "identity_verified",
  "resumed", "reconciled", "completed", "rejected", "expired", "escalated", "manual_review",
];

// POST /v1/recovery-cases/:id/transition is the only write path for case state.
// Body: { to, expectedVersion, note? }. Illegal edges and stale versions → 409.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const to = String(body.to || "") as CaseState;
  const expectedVersion = Number(body.expectedVersion);
  if (!STATES.includes(to) || !Number.isInteger(expectedVersion)) {
    return NextResponse.json({ error: "to (valid state) and expectedVersion (integer) are required" }, { status: 400 });
  }
  try {
    const record = await transition(auth.workspace.id, id, {
      to, expectedVersion, actor: auth.keyPrefix,
      note: body.note ? String(body.note).slice(0, 300) : undefined,
    }, auth.projectId);
    // identity_verified is the rotation moment: advance the lease generation so
    // every worker still holding the old lease is fenced out of new actions,
    // then queue the signed resume callback to the workspace's runtime endpoint.
    let rotatedGeneration: number | undefined;
    let resumeJobId: string | null = null;
    let reconciliation;
    if (record.state === "identity_verified") {
      rotatedGeneration = await advanceLease(auth.workspace.id, record.connectionId);
      const binding = await loadConnectionBinding(record.connectionId, auth.workspace.id);
      // Settle unknown-outcome actions against the provider before the resume
      // callback fires, so the runtime never blind-retries a committed effect.
      reconciliation = await autoReconcileRun({
        workspaceId: auth.workspace.id,
        runId: record.runId,
        connectionId: record.connectionId,
        integrationId: binding?.integrationId || allowedNangoIntegrations()[0] || "microsoft-tenant-specific",
        actor: auth.keyPrefix,
        projectId: auth.projectId,
      });
      resumeJobId = await enqueueRuntimeResume(record, rotatedGeneration);
    }
    await mirrorCaseToConsole(record);
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "case", subjectId: record.id, event: `transition:${record.state}`, detail: { version: record.version, resumeJobId } });
    return NextResponse.json({ id: record.id, state: record.state, version: record.version, rotatedGeneration, reconciliation, resumeQueued: Boolean(resumeJobId), resumeJobId, events: record.events });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
