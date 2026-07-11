import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { createOutcomeTransaction, listOutcomeTransactions } from "@/lib/outcome-transactions";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ transactions: await listOutcomeTransactions(auth.workspace.id, auth.projectId) });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const transaction = await createOutcomeTransaction(auth.workspace.id, {
      ...body, projectId: auth.projectId, requestedBy: auth.keyPrefix,
    });
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "transaction", subjectId: transaction.id, event: "registered", detail: { contractKey: transaction.contractKey, state: transaction.state, steps: transaction.steps.length } });
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not register transaction" }, { status });
  }
}
