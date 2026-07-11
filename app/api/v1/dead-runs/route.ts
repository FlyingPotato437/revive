import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { listDeadRuns, recordDeadRun } from "@/lib/dead-runs";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ runs: await listDeadRuns(auth.workspace.id, auth.projectId) });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, "operator");
  if (!auth.ok) return auth.response;
  try {
    const run = await recordDeadRun(auth.workspace.id, { ...(await req.json()), projectId: auth.projectId });
    await audit({ workspaceId: auth.workspace.id, actor: auth.keyPrefix, subjectKind: "dead_run", subjectId: run.id, event: "detected", detail: { runId: run.runId, category: run.category, recoverable: run.recoverable, classifier: run.classifier, wastedTokens: run.inputTokens + run.outputTokens } });
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not record dead run" }, { status });
  }
}
