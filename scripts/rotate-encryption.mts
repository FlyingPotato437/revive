import { activeEncryptionKey } from "../lib/secrets.ts";
import { openJson, sealJson } from "../lib/secure-envelope.ts";
import { hostedDatabaseEnabled, sqlClient, withWorkspaceTransaction } from "../lib/hosted.ts";

if (!hostedDatabaseEnabled()) throw new Error("DATABASE_URL is required");
const apply = process.argv.includes("--apply");
const active = activeEncryptionKey();
const sql = sqlClient();
const workspaces = await sql<{ id: string }[]>`select id from revive_workspaces order by id`;
const totals = { workspaces: workspaces.length, checked: 0, stale: 0, rotated: 0 };

function keyId(envelope: string): string {
  const parts = envelope.split(".");
  if (parts[0] === "v1") return "legacy";
  if (parts[0] === "v2" && parts[1]) return parts[1];
  throw new Error("invalid secure envelope version");
}

for (const workspace of workspaces) {
  await withWorkspaceTransaction(workspace.id, async (tx) => {
    const connections = await tx<{ id: string; encrypted_token_set: string }[]>`
      select id, encrypted_token_set from revive_connections where workspace_id = ${workspace.id}
    `;
    const secrets = await tx<{ name: string; encrypted_value: string }[]>`
      select name, encrypted_value from revive_workspace_secrets where workspace_id = ${workspace.id}
    `;
    const requests = await tx<{ id: string; token_ciphertext: string }[]>`
      select id, token_ciphertext from revive_action_requests where workspace_id = ${workspace.id}
    `;

    for (const row of connections) {
      totals.checked += 1;
      const purpose = `credential:${row.id}`;
      const value = openJson<unknown>(row.encrypted_token_set, purpose);
      if (keyId(row.encrypted_token_set) === active.id) continue;
      totals.stale += 1;
      if (apply) {
        await tx`update revive_connections set encrypted_token_set = ${sealJson(value, purpose)}, updated_at = now() where workspace_id = ${workspace.id} and id = ${row.id}`;
        totals.rotated += 1;
      }
    }
    for (const row of secrets) {
      totals.checked += 1;
      const purpose = `workspace-secret:${workspace.id}:${row.name}`;
      const value = openJson<unknown>(row.encrypted_value, purpose);
      if (keyId(row.encrypted_value) === active.id) continue;
      totals.stale += 1;
      if (apply) {
        await tx`update revive_workspace_secrets set encrypted_value = ${sealJson(value, purpose)}, updated_at = now() where workspace_id = ${workspace.id} and name = ${row.name}`;
        totals.rotated += 1;
      }
    }
    for (const row of requests) {
      totals.checked += 1;
      const purpose = `action-request:${row.id}`;
      const value = openJson<unknown>(row.token_ciphertext, purpose);
      if (keyId(row.token_ciphertext) === active.id) continue;
      totals.stale += 1;
      if (apply) {
        await tx`update revive_action_requests set token_ciphertext = ${sealJson(value, purpose)}, updated_at = now() where workspace_id = ${workspace.id} and id = ${row.id}`;
        totals.rotated += 1;
      }
    }
  });
}

console.log(JSON.stringify({ mode: apply ? "apply" : "verify", activeKeyId: active.id, ...totals }, null, 2));
if (!apply && totals.stale > 0) {
  console.error(`Found ${totals.stale} envelope(s) not using the active key. Re-run with --apply after verifying backups.`);
  process.exitCode = 2;
}
await sql.end();

