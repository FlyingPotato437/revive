// Seed the creation-time identity binding for the live Nango Entra connection,
// so recovery verification compares real subject/tenant (production-grade path,
// not first-use). Run: npx tsx scripts/seed-golden-connection.mts <connectionId> <oid> <tenant> <upn>
import { saveExternalVaultConnection, loadConnectionBinding } from "../lib/hosted";

const [connectionId, subject, tenant, upn] = process.argv.slice(2);
if (!connectionId || !subject || !tenant) {
  console.error("usage: seed-golden-connection <connectionId> <oid> <tenant> [upn]");
  process.exit(1);
}

await saveExternalVaultConnection({
  id: connectionId,
  workspaceId: "ws_revive_local",
  provider: "microsoft",
  accountId: upn || connectionId,
  scopes: ["offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.Read", "Files.Read.All"],
  vault: "nango",
  integrationId: "microsoft-tenant-specific",
  providerSubject: subject,
  providerTenant: tenant,
  displayName: upn,
});

const binding = await loadConnectionBinding(connectionId, "ws_revive_local");
console.log("bound:", JSON.stringify(binding));
process.exit(0);
