import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { transition, TransitionError } from "@/lib/control-plane";
import { mirrorCaseToConsole } from "@/lib/console-mirror";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /v1/recovery-cases/:id/approve — human approval for a case whose
// resume decision was approval_required. Records WHO approved and releases
// the case from parked into awaiting_authorization so recovery can proceed.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // approver note is optional
  }
  const approver = String(body.approver || auth.keyPrefix).slice(0, 120);
  try {
    const record = await transition(auth.workspace.id, id, {
      to: "awaiting_authorization",
      expectedVersion: Number(body.expectedVersion),
      actor: approver,
      note: `resume approved by ${approver}`.slice(0, 300),
    });
    mirrorCaseToConsole(record);
    await audit({ workspaceId: auth.workspace.id, actor: approver, subjectKind: "case", subjectId: record.id, event: "resume_approved", detail: { version: record.version } });
    return NextResponse.json({ id: record.id, state: record.state, version: record.version, approvedBy: approver });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
