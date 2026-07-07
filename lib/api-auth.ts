import { NextRequest, NextResponse } from "next/server";
import { workspaceForApiKey, type WorkspaceIdentity } from "./workspaces";
import type { ApiKeyRole } from "./workspaces";
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
const ROLE_LEVEL: Record<ApiKeyRole, number> = { viewer: 0, operator: 1, admin: 2 };
export function apiKeyRoleAllows(actual: ApiKeyRole, minimum: ApiKeyRole): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[minimum];
}

export async function authenticateApiKey(req: NextRequest, minimum: ApiKeyRole = "operator"): Promise<
  | { ok: true; workspace: WorkspaceIdentity; projectId: string; role: ApiKeyRole; keyPrefix: string }
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
  if (!apiKeyRoleAllows(workspace.role, minimum)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "forbidden", detail: `${minimum} API-key role required` },
        { status: 403 },
      ),
    };
  }
  const limited = await enforceRateLimit(req, `v1:${workspace.id}:${workspace.projectId}`, V1_LIMIT_PER_MINUTE, 60);
  if (limited) return { ok: false, response: limited };
  return {
    ok: true,
    workspace: { id: workspace.id, name: workspace.name, organization: workspace.organization },
    projectId: workspace.projectId,
    role: workspace.role,
    keyPrefix: key.slice(0, 15),
  };
}
