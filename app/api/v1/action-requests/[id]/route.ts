import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { cancelUserActionRequest, getUserActionRequest } from "@/lib/action-requests";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, "operator");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const request = await getUserActionRequest(auth.workspace.id, id, true);
  return request ? NextResponse.json({ request }) : NextResponse.json({ error: "action request not found" }, { status: 404 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req, "operator");
  if (!auth.ok) return auth.response;
  try {
    const { id } = await params;
    const request = await cancelUserActionRequest(auth.workspace.id, id);
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "action_request", subjectId: id, event: "cancelled" });
    return NextResponse.json({ request });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not cancel action request" }, { status });
  }
}
