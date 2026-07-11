import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "revive-actions-"));
process.env.REVIVE_STATE_DIR = stateDir;
delete process.env.DATABASE_URL;

const actions = await import("../lib/action-requests.ts");
let passed = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); passed += 1; };

const request = await actions.createUserActionRequest("ws_test", {
  projectId: "project_test",
  runId: "run_4821",
  checkpointId: "compensation-review",
  generation: 8,
  idempotencyKey: "candidate-29:comp-review",
  actionType: "approval",
  title: "Confirm compensation",
  recipient: { subjectId: "usr_finance", email: "finance@example.com" },
  expiresIn: "48h",
});
ok(request.id.startsWith("uar_"), "request ID is namespaced");
ok(request.url?.includes("/actions/uar_"), "single-use action URL returned");
ok(request.fields.some((field) => field.key === "decision"), "approval schema supplied");

const duplicate = await actions.createUserActionRequest("ws_test", {
  projectId: "project_test", runId: "run_4821", checkpointId: "compensation-review", generation: 8,
  idempotencyKey: "candidate-29:comp-review", actionType: "approval", title: "Confirm compensation",
  recipient: { subjectId: "usr_finance", email: "finance@example.com" }, expiresIn: "48h",
});
ok(duplicate.id === request.id, "idempotent create returns original request");
await assert.rejects(
  actions.createUserActionRequest("ws_test", {
    projectId: "project_test", runId: "run_4821", checkpointId: "compensation-review", generation: 8,
    idempotencyKey: "candidate-29:comp-review", actionType: "approval", title: "Confirm compensation",
    recipient: { subjectId: "usr_other", email: "other@example.com" }, expiresIn: "48h",
  }),
  /different user action/,
);
passed += 1;

const token = decodeURIComponent(request.url!.split("/actions/")[1]);
const publicRequest = await actions.getUserActionRequestByToken(token);
ok(publicRequest?.recipient.email === "finance@example.com", "token resolves intended recipient");

await assert.rejects(
  actions.completeUserActionRequest(token, { generation: 7, response: { decision: "approve" } }),
  /stale run generation/,
);
passed += 1;
await assert.rejects(
  actions.completeUserActionRequest(token, { generation: 8, response: { decision: "invalid" } }),
  /invalid choice/,
);
passed += 1;

const completed = await actions.completeUserActionRequest(token, { generation: 8, response: { decision: "approve" } });
ok(completed.status === "completed", "valid response completes request");
ok(completed.completedBy?.subjectId === "usr_finance", "completion binds intended subject");
ok(completed.response?.decision === "approve", "structured response stored");
ok(!("response" in actions.toPublicUserAction(completed)), "public payload does not expose submitted response");

const replay = await actions.completeUserActionRequest(token, { generation: 8, response: { decision: "reject" } });
ok(replay.response?.decision === "approve", "replayed link cannot replace response");

fs.rmSync(stateDir, { recursive: true, force: true });
console.log(`action requests: ${passed}/13 assertions passed`);
