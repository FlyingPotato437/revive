import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const state = fs.mkdtempSync(path.join(os.tmpdir(), "revive-auth-boundaries-"));
process.env.REVIVE_STATE_DIR = state;
delete process.env.DATABASE_URL;

const { apiKeyRoleAllows } = await import("../lib/api-auth.ts");
const {
  getAction,
  getCase,
  listActions,
  listCases,
  openCase,
  registerAction,
} = await import("../lib/control-plane.ts");
const {
  safeDotPathGet,
  validateCustomConnectorInput,
} = await import("../lib/custom-connectors.ts");
const { identityFromCustomProbe } = await import("../lib/integrations/providers.ts");

assert.equal(apiKeyRoleAllows("viewer", "operator"), false);
assert.equal(apiKeyRoleAllows("operator", "viewer"), true);
assert.equal(apiKeyRoleAllows("operator", "admin"), false);
assert.equal(apiKeyRoleAllows("admin", "admin"), true);

const commonAction = {
  runId: "shared-run",
  connectionId: "conn_1",
  actionKey: "send-email",
  idempotencyKey: "idem_1",
};
const actionA = await registerAction("ws_test", { ...commonAction, projectId: "prj_a" });
const actionB = await registerAction("ws_test", { ...commonAction, projectId: "prj_b" });
assert.notEqual(actionA.id, actionB.id, "project identity must be part of action uniqueness");
assert.equal(await getAction("ws_test", actionA.id, "prj_b"), null, "cross-project action lookup must fail closed");
assert.deepEqual((await listActions("ws_test", "prj_a")).map((action) => action.id), [actionA.id]);

const commonCase = {
  runId: "shared-run",
  connectionId: "conn_1",
  actionKey: "send-email",
  idempotencyKey: "idem_1",
  reason: "invalid_grant",
};
const caseA = await openCase("ws_test", { ...commonCase, projectId: "prj_a" });
const caseB = await openCase("ws_test", { ...commonCase, projectId: "prj_b" });
assert.notEqual(caseA.id, caseB.id, "project identity must be part of case uniqueness");
assert.equal(await getCase("ws_test", caseA.id, "prj_b"), null, "cross-project case lookup must fail closed");
assert.deepEqual((await listCases("ws_test", { projectId: "prj_b" })).map((record) => record.id), [caseB.id]);

const connector = {
  integrationId: "linear-custom",
  label: "Linear",
  identityProbe: { path: "/v2/me", subjectField: "id", tenantField: "org.id", accountField: "email" },
  provisional: true as const,
  createdBy: "operator@example.com",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};
assert.equal(safeDotPathGet({ org: { id: "tenant-1" } }, "org.id"), "tenant-1");
assert.throws(() => safeDotPathGet({ org: {} }, "org.__proto__"), /blocked path segment/);
assert.deepEqual(identityFromCustomProbe({ id: "user-1", org: { id: "tenant-1" }, email: "u@example.com" }, connector), {
  subject: "user-1", tenant: "tenant-1", accountId: "u@example.com",
});
assert.throws(() => identityFromCustomProbe({ id: "user-1", org: {}, email: "u@example.com" }, connector), /returned no tenant/);
assert.throws(() => validateCustomConnectorInput({ ...connector, identityProbe: { ...connector.identityProbe, path: "https://api.example.com/me" } }), /relative provider path/);
assert.throws(() => validateCustomConnectorInput({ ...connector, identityProbe: { ...connector.identityProbe, path: "//evil.example/me" } }), /relative provider path/);

fs.rmSync(state, { recursive: true, force: true });
console.log("auth-boundary checks passed");
