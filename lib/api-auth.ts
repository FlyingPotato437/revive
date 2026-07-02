import { NextRequest, NextResponse } from "next/server";
import { workspaceForApiKey, type WorkspaceIdentity } from "./workspaces";

/**
 * API-key authentication for the hosted /v1 control-plane routes.
 * Bearer rv_live_… → workspace. Revoked keys rejected inside
 * workspaceForApiKey (hash lookup is constant-time, lastUsedAt is touched).
 */
export async function authenticateApiKey(req: NextRequest): Promise<
  | { ok: true; workspace: WorkspaceIdentity; keyPrefix: string }
  | { ok: false; response: NextResponse }
> {
  const header = req.headers.get("authorization") || "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const workspace = key ? await workspaceForApiKey(key) : null;
  if (!workspace) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized", detail: "missing, invalid, or revoked API key" },
        { status: 401, headers: { "www-authenticate": 'Bearer realm="revive", error="invalid_token"' } },
      ),
    };
  }
  return { ok: true, workspace, keyPrefix: key.slice(0, 15) };
}
