import { NextRequest, NextResponse } from "next/server";
import { startSession } from "@/lib/engine";
import { DEFAULT_FAILURE_STEP, RUN_SCRIPT } from "@/lib/steps";
import { listSessionsForWorkspace } from "@/lib/store";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = sessionFromCookies(req.cookies);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const workspace = await selectedWorkspace(auth.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
  // Rows hydrated from Postgres can predate newer run-state fields; a single
  // legacy row must not take down the whole case list.
  const sessions = (await listSessionsForWorkspace(workspace.id)).map((session) => ({
    id: session.id,
    createdAt: session.createdAt,
    deathCode: session.deathCode,
    status: session.revive?.status ?? "idle",
    runId: session.revive?.id ?? session.id,
    recoveryCase: session.revive?.recoveryCase,
    completedSteps: session.revive?.metrics?.completedSteps ?? 0,
    totalSteps: session.revive?.steps?.length ?? 0,
    recoveredMs: session.revive?.metrics?.recoveredMs,
    generation: session.revive?.token?.generation ?? 1,
    deduplicatedActions: session.revive?.metrics?.deduplicatedActions ?? 0,
  }));
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const auth = sessionFromCookies(req.cookies);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let failureStep = DEFAULT_FAILURE_STEP;
  let deathCode = "AADSTS700082";
  try {
    const body = await req.json();
    if (typeof body.failureStep === "number") failureStep = body.failureStep;
    if (typeof body.deathCode === "string") deathCode = body.deathCode;
  } catch {
    /* defaults */
  }
  failureStep = Math.max(0, Math.min(RUN_SCRIPT.length - 1, failureStep));

  const workspace = await selectedWorkspace(auth.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
  const session = startSession(failureStep, deathCode, workspace.id);
  return NextResponse.json({
    sessionId: session.id,
    failureStep: session.failureStep,
    deathCode: session.deathCode,
  });
}
