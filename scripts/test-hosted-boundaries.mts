import assert from "node:assert/strict";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import {
  ensureHostedWorkspace,
  hostedDatabaseEnabled,
  saveHostedApiKey,
  sqlClient,
  withWorkspaceTransaction,
} from "../lib/hosted.ts";
import { getAction, getCase, listActions, listCases, openCase, registerAction } from "../lib/control-plane.ts";
import { deleteCustomConnector, getCustomConnector, setCustomConnector } from "../lib/custom-connectors.ts";
import { workspaceForApiKey } from "../lib/workspaces.ts";
import { GET as listActionsRoute, POST as createActionRoute } from "../app/api/v1/actions/route.ts";
import { POST as completeActionRoute } from "../app/api/v1/actions/[id]/complete/route.ts";
import { getDeadRun, getDeadRunStats, listDeadRuns, recordDeadRun } from "../lib/dead-runs.ts";
import { reviveDeadRun } from "../lib/revive-dead-run.ts";

if (!hostedDatabaseEnabled()) throw new Error("DATABASE_URL is required");
const suffix = crypto.randomBytes(6).toString("hex");
const workspaceId = `ws_scope_test_${suffix}`;
const organization = `Scope test ${suffix}`;
const ownerEmail = `scope-${suffix}@example.com`;
const projectA = `prj_scope_a_${suffix}`;
const projectB = `prj_scope_b_${suffix}`;
const sql = sqlClient();

await ensureHostedWorkspace({ id: workspaceId, name: "Scope test", organization, ownerEmail });
const org = await sql<{ organization_id: string }[]>`select organization_id from revive_workspaces where id = ${workspaceId}`;
try {
  await withWorkspaceTransaction(workspaceId, async (tx) => {
    await tx`insert into revive_projects (id, workspace_id, name) values (${projectA}, ${workspaceId}, 'Project A'), (${projectB}, ${workspaceId}, 'Project B')`;
  });

  const commonAction = { runId: "run", connectionId: "conn", actionKey: "send", idempotencyKey: "idem" };
  const actionA = await registerAction(workspaceId, { ...commonAction, projectId: projectA });
  const actionB = await registerAction(workspaceId, { ...commonAction, projectId: projectB });
  assert.notEqual(actionA.id, actionB.id);
  assert.equal(await getAction(workspaceId, actionA.id, projectB), null);
  assert.deepEqual((await listActions(workspaceId, projectA)).map((item) => item.id), [actionA.id]);

  const commonCase = { ...commonAction, reason: "invalid_grant" };
  const caseA = await openCase(workspaceId, { ...commonCase, projectId: projectA });
  const caseB = await openCase(workspaceId, { ...commonCase, projectId: projectB });
  assert.notEqual(caseA.id, caseB.id);
  assert.equal(await getCase(workspaceId, caseA.id, projectB), null);
  assert.deepEqual((await listCases(workspaceId, { projectId: projectB })).map((item) => item.id), [caseB.id]);

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const claudeModel = process.env.REVIVE_CLAUDE_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.REVIVE_CLAUDE_MODEL;
  const deadRun = await recordDeadRun(workspaceId, {
    projectId: projectA, runId: "dead-run", checkpointId: "oauth", generation: 3,
    idempotencyKey: "terminal", runtime: "langgraph", failureMessage: "OAuth invalid_grant after token revoked",
    inputTokens: 500, outputTokens: 100, estimatedCostUsd: .2,
  });
  if (anthropicKey) process.env.ANTHROPIC_API_KEY = anthropicKey;
  if (claudeModel) process.env.REVIVE_CLAUDE_MODEL = claudeModel;
  assert.equal((await getDeadRun(workspaceId, deadRun.id))?.category, "expired_oauth");
  assert.deepEqual((await listDeadRuns(workspaceId, projectB)).map((item) => item.id), []);
  assert.equal((await getDeadRunStats(workspaceId, 7, projectA)).wastedTokens, 600);
  const resolution = await reviveDeadRun(workspaceId, deadRun.id, {
    recipient: { subjectId: "owner", email: "owner@example.com" },
    destinationUrl: "https://connect.example.com/oauth", requestedBy: ownerEmail,
  });
  assert.equal(resolution.request.validation?.deadRunId, deadRun.id);
  assert.equal(resolution.request.generation, 3);

  async function makeKey(name: string, projectId: string, role: "viewer" | "operator" | "admin") {
    const raw = `rv_live_${Buffer.from(workspaceId).toString("base64url")}.${crypto.randomBytes(24).toString("base64url")}`;
    await saveHostedApiKey({
      workspace: { id: workspaceId, name: "Scope test", organization, ownerEmail },
      id: `key_${name}_${suffix}`,
      name,
      prefix: raw.slice(0, 15),
      hash: crypto.createHash("sha256").update(raw).digest("hex"),
      createdAt: Date.now(), projectId, role,
    });
    return raw;
  }
  const rawKey = await makeKey("viewer", projectA, "viewer");
  const operatorA = await makeKey("operator_a", projectA, "operator");
  const operatorB = await makeKey("operator_b", projectB, "operator");
  const identity = await workspaceForApiKey(rawKey);
  assert.equal(identity?.projectId, projectA);
  assert.equal(identity?.role, "viewer");

  const actionBody = JSON.stringify({ runId: "route-run", connectionId: "route-conn", actionKey: "route-send", idempotencyKey: "route-idem" });
  const viewerWrite = await createActionRoute(new NextRequest("http://localhost/v1/actions", {
    method: "POST", headers: { authorization: `Bearer ${rawKey}`, "content-type": "application/json" }, body: actionBody,
  }));
  assert.equal(viewerWrite.status, 403, "viewer keys must not mutate the control plane");
  const operatorWrite = await createActionRoute(new NextRequest("http://localhost/v1/actions", {
    method: "POST", headers: { authorization: `Bearer ${operatorA}`, "content-type": "application/json" }, body: actionBody,
  }));
  assert.equal(operatorWrite.status, 200);
  const routeAction = await operatorWrite.json() as { id: string };
  const crossProjectMutation = await completeActionRoute(new NextRequest(`http://localhost/v1/actions/${routeAction.id}/complete`, {
    method: "POST", headers: { authorization: `Bearer ${operatorB}`, "content-type": "application/json" }, body: "{}",
  }), { params: Promise.resolve({ id: routeAction.id }) });
  assert.equal(crossProjectMutation.status, 404, "a project key must not mutate another project's action");
  const projectBList = await listActionsRoute(new NextRequest("http://localhost/v1/actions", {
    headers: { authorization: `Bearer ${operatorB}` },
  }));
  const projectBPayload = await projectBList.json() as { actions: Array<{ id: string }> };
  assert.equal(projectBPayload.actions.some((item) => item.id === routeAction.id), false, "a project key must not list another project's action");

  await setCustomConnector(workspaceId, ownerEmail, {
    integrationId: `linear-${suffix}`,
    label: "Linear",
    identityProbe: { path: "/v2/me", subjectField: "id", tenantField: "organization.id", accountField: "email" },
  });
  assert.equal((await getCustomConnector(workspaceId, `linear-${suffix}`))?.provisional, true);
  await deleteCustomConnector(workspaceId, `linear-${suffix}`);
  assert.equal(await getCustomConnector(workspaceId, `linear-${suffix}`), null);
  console.log("hosted project, role, detector, and connector boundary checks passed");
} finally {
  await withWorkspaceTransaction(workspaceId, async (tx) => {
    await tx`delete from revive_dead_runs where workspace_id = ${workspaceId}`;
    await tx`delete from revive_action_requests where workspace_id = ${workspaceId}`;
    await tx`delete from revive_recovery_cases where workspace_id = ${workspaceId}`;
    await tx`delete from revive_actions where workspace_id = ${workspaceId}`;
    await tx`delete from revive_api_keys where workspace_id = ${workspaceId}`;
    await tx`delete from revive_custom_connectors where workspace_id = ${workspaceId}`;
    await tx`delete from revive_projects where workspace_id = ${workspaceId}`;
  });
  await sql`delete from revive_workspaces where id = ${workspaceId}`;
  if (org[0]) {
    await sql`delete from revive_memberships where organization_id = ${org[0].organization_id}`;
    await sql`delete from revive_organizations where id = ${org[0].organization_id}`;
  }
}
