import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { decideTransactionApproval } from "@/lib/outcome-transactions";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, "operator");
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const body = await req.json();
    const decision = body.decision === "deny" ? "deny" : body.decision === "approve" ? "approve" : null;
    if (!decision) return NextResponse.json({ error: "decision must be approve or deny" }, { status: 400 });
    const transaction = await decideTransactionApproval(auth.workspace.id, id, { decision, actor: auth.keyPrefix, reason: body.reason, projectId: auth.projectId });
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "transaction", subjectId: id, event: `approval_${decision}d`, detail: { state: transaction.state } });
    return NextResponse.json({ transaction });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not decide transaction" }, { status });
  }
}
