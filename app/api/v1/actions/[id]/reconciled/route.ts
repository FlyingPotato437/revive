import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { reconcileAction, TransitionError } from "@/lib/control-plane";

export const dynamic = "force-dynamic";

// POST /v1/actions/:id/reconciled implements ReviveTransport.markReconciled.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let remoteId: string | undefined;
  let note: string | undefined;
  try {
    const body = await req.json();
    if (body?.remoteId) remoteId = String(body.remoteId);
    if (body?.note) note = String(body.note);
  } catch {
    /* body optional */
  }
  try {
    const action = await reconcileAction(auth.workspace.id, id, { remoteId, note }, auth.projectId);
    return NextResponse.json({ id: action.id, state: action.state, version: action.version });
  } catch (error) {
    if (error instanceof TransitionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
