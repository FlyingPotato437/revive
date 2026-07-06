// One-shot local verification of the per-workspace resume delivery path:
// builds the exact runtime.resume job the transition enqueued and delivers it
// in-process (bypassing the shared queue, which a deployed worker also polls),
// then prints the case state. Usage:
//   node --env-file-if-exists=.env.local --import tsx scripts/verify-resume-delivery.mts <workspaceId> <caseId>
import { getCase } from "../lib/control-plane";
import { deliverRuntimeResumeJob } from "../lib/webhooks";

const [workspaceId, caseId] = process.argv.slice(2);
if (!workspaceId || !caseId) throw new Error("usage: verify-resume-delivery.mts <workspaceId> <caseId>");

const record = await getCase(workspaceId, caseId);
if (!record) throw new Error("case not found");
console.log("before:", record.state, "v" + record.version);

await deliverRuntimeResumeJob({
  id: `resume_${record.id}_v${record.version}`,
  kind: "runtime.resume",
  attempts: 0,
  maxAttempts: 1,
  payload: {
    endpoint: "http://127.0.0.1:8752/",
    secretSource: "workspace",
    workspaceId: record.workspaceId,
    caseId: record.id,
    runId: record.runId,
    checkpointId: record.checkpointId,
    connectionId: record.connectionId,
    actionKey: record.actionKey,
    idempotencyKey: record.idempotencyKey,
    generation: 3,
  },
});

const after = await getCase(workspaceId, caseId);
console.log("after:", after?.state, "v" + after?.version);
