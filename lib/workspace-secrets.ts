// Per-workspace secret configuration: lets an organization bring its own
// vault credentials (e.g. its own Nango project key) instead of sharing the
// platform default. Values are envelope-encrypted before they reach Postgres
// and are readable only inside the workspace's RLS transaction.

import { sealJson, openJson } from "@/lib/secure-envelope";
import { hostedDatabaseEnabled, withWorkspaceTransaction } from "@/lib/hosted";

export type WorkspaceSecretName = "nango_secret_key";

export async function setWorkspaceSecret(workspaceId: string, name: WorkspaceSecretName, value: string): Promise<void> {
  if (!hostedDatabaseEnabled()) throw new Error("workspace secrets require the hosted database");
  const encrypted = sealJson({ value }, `workspace-secret:${workspaceId}:${name}`);
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`
      insert into revive_workspace_secrets (workspace_id, name, encrypted_value)
      values (${workspaceId}, ${name}, ${encrypted})
      on conflict (workspace_id, name) do update
      set encrypted_value = excluded.encrypted_value, updated_at = now()
    `;
  });
}

export async function getWorkspaceSecret(workspaceId: string, name: WorkspaceSecretName): Promise<string | null> {
  if (!hostedDatabaseEnabled()) return null;
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<{ encrypted_value: string }[]>`
      select encrypted_value from revive_workspace_secrets
      where workspace_id = ${workspaceId} and name = ${name}
    `;
    if (!rows[0]) return null;
    return openJson<{ value: string }>(rows[0].encrypted_value, `workspace-secret:${workspaceId}:${name}`).value;
  });
}

/** Workspace-specific Nango key when configured; platform default otherwise. */
export async function resolveNangoSecretKey(workspaceId?: string): Promise<string | undefined> {
  if (workspaceId) {
    try {
      const scoped = await getWorkspaceSecret(workspaceId, "nango_secret_key");
      if (scoped) return scoped;
    } catch {
      // fall through to the platform default
    }
  }
  return process.env.NANGO_SECRET_KEY;
}
