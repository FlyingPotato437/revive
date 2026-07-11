import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getOutcomeContract } from "@/lib/outcome-transactions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const contract = await getOutcomeContract(auth.workspace.id, id, auth.projectId);
  return contract ? NextResponse.json({ contract }) : NextResponse.json({ error: "outcome contract not found" }, { status: 404 });
}
