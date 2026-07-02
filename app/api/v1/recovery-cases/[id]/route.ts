import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getCase } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

// GET /v1/recovery-cases/:id — full case with event timeline.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const record = await getCase(auth.workspace.id, id);
  if (!record) return NextResponse.json({ error: "case not found" }, { status: 404 });
  return NextResponse.json({ case: record });
}
