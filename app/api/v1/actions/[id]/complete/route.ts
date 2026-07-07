import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { completeAction, TransitionError } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

// POST /v1/actions/:id/complete implements ReviveTransport.completeAction.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let resultRef: string | undefined;
  try {
    const body = await req.json();
    if (body?.result !== undefined) resultRef = JSON.stringify(body.result).slice(0, 16_000);
  } catch {
    /* body optional */
  }
  try {
    const action = await completeAction(auth.workspace.id, id, resultRef, auth.projectId);
    return NextResponse.json({ id: action.id, state: action.state, version: action.version });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
