import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { createApiKey, revokeApiKey, selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export async function POST(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspace = selectedWorkspace(session.email, request.cookies.get(WORKSPACE_COOKIE)?.value);
    const result = createApiKey(session.email, workspace.id, String(body.name || ""));
    return NextResponse.json({ key: result.key, record: { ...result.record, hash: undefined } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create API key" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspace = selectedWorkspace(session.email, request.cookies.get(WORKSPACE_COOKIE)?.value);
    revokeApiKey(session.email, workspace.id, String(body.keyId || ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revoke API key" }, { status: 400 });
  }
}
