import { createUserActionRequest, getUserActionRequest } from "./action-requests";
import { attachDeadRunResolution, getDeadRun } from "./dead-runs";
import { TransitionError } from "./control-plane";

export async function reviveDeadRun(workspaceId: string, id: string, input: {
  recipient: unknown; title?: string; description?: string; destinationUrl?: string; fields?: unknown; expiresIn?: string; requestedBy: string;
}) {
  const deadRun = await getDeadRun(workspaceId, id);
  if (!deadRun) throw new TransitionError("dead run not found", 404);
  if (!deadRun.recoverable) throw new TransitionError("run has no classified human-dependent blocker", 409);
  if (deadRun.actionRequestId) {
    const existing = await getUserActionRequest(workspaceId, deadRun.actionRequestId, true);
    if (existing) return { deadRun, request: existing };
  }
  const request = await createUserActionRequest(workspaceId, {
    projectId: deadRun.projectId,
    runId: deadRun.runId,
    checkpointId: deadRun.checkpointId,
    generation: deadRun.generation,
    idempotencyKey: `dead-run:${deadRun.id}`,
    actionType: deadRun.suggestedActionType,
    title: String(input.title || deadRun.suggestedQuestion).slice(0, 180),
    description: String(input.description || deadRun.reason).slice(0, 1200),
    recipient: input.recipient,
    fields: input.fields,
    context: {
      blocker: deadRun.category.replaceAll("_", " "),
      runtime: deadRun.runtime,
      detected_at: new Date(deadRun.createdAt).toISOString(),
      run_id: deadRun.runId,
    },
    destinationUrl: input.destinationUrl,
    expiresIn: input.expiresIn || "48h",
    requestedBy: input.requestedBy,
    validation: {
      mode: "claude",
      deadRunId: deadRun.id,
      criterion: `Response must resolve this blocker before continuation: ${deadRun.suggestedQuestion}`,
    },
  });
  const updated = await attachDeadRunResolution(workspaceId, deadRun.id, request.id);
  return { deadRun: updated, request };
}
