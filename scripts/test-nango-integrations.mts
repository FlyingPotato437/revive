import assert from "node:assert/strict";
import { availableBuiltInNangoIntegrations } from "../lib/integrations/providers";

const registered = [
  { id: "microsoft-tenant-specific", provider: "microsoft-tenant-specific", displayName: "Microsoft" },
  { id: "github-getting-started", provider: "github", displayName: "GitHub" },
];

const available = availableBuiltInNangoIntegrations(registered, [
  "microsoft-tenant-specific",
  "github-getting-started",
  "google-mail",
  "slack",
]);

assert.deepEqual(available.map((integration) => integration.id), [
  "microsoft-tenant-specific",
  "github-getting-started",
]);
assert.deepEqual(available.map((integration) => integration.label), ["Microsoft 365", "GitHub"]);
assert.equal(available.some((integration) => integration.id === "google-mail"), false);
assert.equal(available.some((integration) => integration.id === "slack"), false);
assert.deepEqual(availableBuiltInNangoIntegrations(registered, []), []);

console.log("Nango integration registry: 5/5 assertions passed");
