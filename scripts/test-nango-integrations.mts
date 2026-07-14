import assert from "node:assert/strict";
import { resolveNangoIntegrationOptions } from "../lib/integrations/providers";
import { curatedIdentityProbe } from "../lib/integrations/identity-probes";
import type { CustomConnectorDefinition } from "../lib/custom-connectors";

const registered = [
  { id: "microsoft-tenant-specific", provider: "microsoft-tenant-specific", displayName: "Microsoft" },
  { id: "github-getting-started", provider: "github", displayName: "GitHub" },
  { id: "salesforce", provider: "salesforce", displayName: "Salesforce" },
  { id: "linear", provider: "linear", displayName: "Linear" },
];

const customConnector = (integrationId: string, label: string): CustomConnectorDefinition => ({
  integrationId,
  label,
  identityProbe: { path: "/v2/me", subjectField: "id", tenantField: "org.id", accountField: "email" },
  provisional: true,
  createdBy: "test@revive.dev",
  createdAt: 0,
  updatedAt: 0,
});

// Restriction set: only listed integration ids are offered, built-ins only.
const restrictedOptions = resolveNangoIntegrationOptions(registered, ["microsoft-tenant-specific", "github-getting-started", "google-mail", "slack"], []);
assert.deepEqual(restrictedOptions.map((integration) => integration.id).sort(), [
  "github-getting-started",
  "microsoft-tenant-specific",
]);
assert.deepEqual(restrictedOptions.map((integration) => integration.label).sort(), ["GitHub", "Microsoft 365"]);
assert.equal(restrictedOptions.every((integration) => !integration.provisional), true);

// Empty restriction blocks everything; unset (null) means unrestricted.
assert.deepEqual(resolveNangoIntegrationOptions(registered, [], []), []);

// Unrestricted: built-ins are certified, curated probe pack fills salesforce
// as provisional, and linear (no probe, no custom connector) is excluded.
const openOptions = resolveNangoIntegrationOptions(registered, null, []);
assert.deepEqual(openOptions.map((integration) => integration.id), [
  "github-getting-started",
  "microsoft-tenant-specific",
  "salesforce",
]);
const salesforce = openOptions.find((integration) => integration.id === "salesforce");
assert.equal(salesforce?.provisional, true);
assert.equal(salesforce?.label, "Salesforce");
assert.equal(openOptions.some((integration) => integration.id === "linear"), false);

// A workspace custom connector fills an id the packs do not cover…
const withCustom = resolveNangoIntegrationOptions(registered, null, [customConnector("linear", "Linear (ops)")]);
const linear = withCustom.find((integration) => integration.id === "linear");
assert.equal(linear?.provisional, true);
assert.equal(linear?.label, "Linear (ops)");

// …but cannot shadow a built-in adapter.
const shadowAttempt = resolveNangoIntegrationOptions(registered, null, [customConnector("microsoft-tenant-specific", "Shadow")]);
const microsoft = shadowAttempt.find((integration) => integration.id === "microsoft-tenant-specific");
assert.equal(microsoft?.provisional, false);
assert.equal(microsoft?.label, "Microsoft 365");

// Certified options sort ahead of provisional ones.
assert.deepEqual(openOptions.map((integration) => integration.provisional), [false, false, true]);

// Curated probes must be valid relative paths with safe dot-path fields.
for (const [provider, curated] of Object.entries(
  await import("../lib/integrations/identity-probes").then((module) => module.CURATED_IDENTITY_PROBES),
)) {
  assert.ok(curated.probe.path.startsWith("/") && !curated.probe.path.startsWith("//"), `${provider} probe path`);
  for (const field of [curated.probe.subjectField, curated.probe.tenantField, curated.probe.accountField]) {
    assert.match(field, /^[A-Za-z0-9_@-]+(?:\.[A-Za-z0-9_@-]+)*$/, `${provider} identity field "${field}"`);
  }
}
assert.equal(curatedIdentityProbe("salesforce-sandbox")?.probe.path, "/services/oauth2/userinfo");
assert.equal(curatedIdentityProbe("unknown-provider"), null);

console.log("Nango integration registry: all assertions passed");
