import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getOutcomeTransaction } from "@/lib/outcome-transactions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const transaction = await getOutcomeTransaction(auth.workspace.id, id, auth.projectId);
  return transaction ? NextResponse.json({ transaction }) : NextResponse.json({ error: "transaction not found" }, { status: 404 });
}
