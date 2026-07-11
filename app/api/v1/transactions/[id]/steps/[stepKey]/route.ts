import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { transitionTransactionStep, type TransactionStepState } from "@/lib/outcome-transactions";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

const STATES = new Set<TransactionStepState>(["planned", "executing", "succeeded", "verifying", "verified", "unknown", "failed", "compensating", "compensated", "skipped"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; stepKey: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  try {
    const { id, stepKey } = await params;
    const body = await req.json();
    if (!STATES.has(body.to)) return NextResponse.json({ error: "invalid step state" }, { status: 400 });
    if (!Number.isInteger(body.expectedVersion)) return NextResponse.json({ error: "expectedVersion is required" }, { status: 400 });
    const transaction = await transitionTransactionStep(auth.workspace.id, id, stepKey, {
      ...body, to: body.to, expectedVersion: body.expectedVersion, projectId: auth.projectId,
    });
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "transaction", subjectId: id, event: "step_transitioned", detail: { stepKey, to: body.to, transactionState: transaction.state } });
    return NextResponse.json({ transaction });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not transition transaction step" }, { status });
  }
}
