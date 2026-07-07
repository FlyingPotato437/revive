import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { transition, TransitionError } from "@/lib/control-plane";
import { mirrorCaseToConsole } from "@/lib/console-mirror";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /v1/recovery-cases/:id/deny handles human denial. The case terminates as
// rejected and the parked run is never resumed under this case.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // denier note is optional
  }
  const denier = String(body.approver || auth.keyPrefix).slice(0, 120);
  try {
    const record = await transition(auth.workspace.id, id, {
      to: "rejected",
      expectedVersion: Number(body.expectedVersion),
      actor: denier,
      note: (body.note ? `resume denied by ${denier}: ${String(body.note)}` : `resume denied by ${denier}`).slice(0, 300),
    }, auth.projectId);
    await mirrorCaseToConsole(record);
    await audit({ workspaceId: auth.workspace.id, actor: denier, subjectKind: "case", subjectId: record.id, event: "resume_denied", detail: { version: record.version } });
    return NextResponse.json({ id: record.id, state: record.state, version: record.version, deniedBy: denier });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
