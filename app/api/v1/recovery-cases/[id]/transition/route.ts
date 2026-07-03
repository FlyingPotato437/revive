import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { advanceLease, transition, TransitionError, type CaseState } from "@/lib/control-plane";
import { mirrorCaseToConsole } from "@/lib/console-mirror";
import { audit } from "@/lib/audit";

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
    });
    // identity_verified is the rotation moment: advance the lease generation so
    // every worker still holding the old lease is fenced out of new actions.
    let rotatedGeneration: number | undefined;
    if (record.state === "identity_verified") {
      rotatedGeneration = await advanceLease(auth.workspace.id, record.connectionId);
    }
    mirrorCaseToConsole(record);
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "case", subjectId: record.id, event: `transition:${record.state}`, detail: { version: record.version } });
    return NextResponse.json({ id: record.id, state: record.state, version: record.version, rotatedGeneration, events: record.events });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
