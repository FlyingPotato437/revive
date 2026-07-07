import { NextRequest, NextResponse } from "next/server";
import { createNangoReconnectSession, allowedNangoIntegrations } from "@/lib/integrations/nango";
import { connectSessionDefaults, nangoIntegrationAvailable } from "@/lib/integrations/providers";
import { loadConnectionBinding } from "@/lib/hosted";
import { resolveRecoveryTarget } from "@/lib/recovery-target";
import { transition, TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticket: string }> }) {
  const limited = await enforceRateLimit(req, "nango:recovery-session", 8, 60);
  if (limited) return limited;
  const { ticket } = await params;
  const target = await resolveRecoveryTarget(ticket);
  if (!target) return NextResponse.json({ error: "recovery request is inactive" }, { status: 410 });
  if (target.kind !== "control") {
    return NextResponse.json({ error: "Nango reconnect is available for hosted recovery cases" }, { status: 409 });
  }
  try {
    let record = target.record;
    if (record.state === "parked") {
      record = await transition(record.workspaceId, record.id, {
        to: "awaiting_authorization",
        expectedVersion: record.version,
        actor: "nango-connect",
      });
    }
    if (record.state !== "awaiting_authorization") {
      return NextResponse.json({ error: `recovery case cannot authorize from ${record.state}` }, { status: 409 });
    }
    // Reconnect through the SAME integration the connection was created with;
    // the allowlist head is only a fallback for pre-registry connections.
    const binding = await loadConnectionBinding(record.connectionId, record.workspaceId);
    const integrationId = binding?.integrationId || allowedNangoIntegrations()[0];
    if (!integrationId) return NextResponse.json({ error: "no Nango integration is allowlisted" }, { status: 503 });
    if (!(await nangoIntegrationAvailable(record.workspaceId, integrationId))) {
      return NextResponse.json({ error: "the connection's Nango integration is no longer registered" }, { status: 409 });
    }
    const result = await createNangoReconnectSession({
      connectionId: record.connectionId,
      integrationId,
      integrationDefaults: connectSessionDefaults([integrationId]),
    });
    await audit({
      workspaceId: record.workspaceId,
      actor: "nango-connect",
      subjectKind: "case",
      subjectId: record.id,
      event: "authorization_session_created",
      detail: { integrationId, connectionId: record.connectionId },
    });
    return NextResponse.json({ ...result, integrationId, connectionId: record.connectionId });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 502;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nango reconnect failed" }, { status });
  }
}
