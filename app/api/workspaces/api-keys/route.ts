import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { createApiKey, revokeApiKey, selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export async function POST(request: NextRequest) {
  const session = sessionFromCookies(request.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const workspace = selectedWorkspace(session.email, request.cookies.get(WORKSPACE_COOKIE)?.value);
    const expiresInDays = body.expiresInDays === undefined || body.expiresInDays === null || body.expiresInDays === "never"
      ? undefined
      : Number(body.expiresInDays);
    const result = await createApiKey(session.email, workspace.id, String(body.name || ""), { expiresInDays });
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
    await revokeApiKey(session.email, workspace.id, String(body.keyId || ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revoke API key" }, { status: 400 });
  }
}
