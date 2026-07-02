import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { startAction, TransitionError } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

// POST /v1/actions/:id/started — recorded immediately before execute() runs.
// Separates "registered" (prepared, never attempted) from "attempted"
// (started, unknown outcome until completed).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const action = await startAction(auth.workspace.id, id);
    return NextResponse.json({ id: action.id, state: action.state, version: action.version });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
