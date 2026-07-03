import { NextRequest, NextResponse } from "next/server";
import { workspaceForApiKey, type WorkspaceIdentity } from "./workspaces";
import { enforceRateLimit } from "./rate-limit";

// Per-workspace ceiling on authenticated /v1 traffic. Well above real SDK use
// (one action is a few calls), but caps a leaked or over-privileged key from
// flooding the control plane and exhausting the database pool.
const V1_LIMIT_PER_MINUTE = 600;

/**
 * API-key authentication for the hosted /v1 control-plane routes.
 * Bearer rv_live_… → workspace. Revoked keys rejected inside
 * workspaceForApiKey (hash lookup is constant-time, lastUsedAt is touched).
 * On success, enforces a per-workspace rate limit before returning.
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
  const limited = await enforceRateLimit(req, `v1:${workspace.id}`, V1_LIMIT_PER_MINUTE, 60);
  if (limited) return { ok: false, response: limited };
  return { ok: true, workspace, keyPrefix: key.slice(0, 15) };
}
