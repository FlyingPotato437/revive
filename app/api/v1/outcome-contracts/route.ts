import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { createOutcomeContract, listOutcomeContracts } from "@/lib/outcome-transactions";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ contracts: await listOutcomeContracts(auth.workspace.id, auth.projectId) });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, "admin");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const contract = await createOutcomeContract(auth.workspace.id, { ...body, projectId: auth.projectId });
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "outcome_contract", subjectId: contract.id, event: "created", detail: { contractKey: contract.key, version: contract.version } });
    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not create outcome contract" }, { status });
  }
}
