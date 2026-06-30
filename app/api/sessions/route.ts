import { NextRequest, NextResponse } from "next/server";
import { startSession } from "@/lib/engine";
import { DEFAULT_FAILURE_STEP, RUN_SCRIPT } from "@/lib/steps";
import { listSessions } from "@/lib/store";
import { sessionFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!sessionFromCookies(req.cookies)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sessions = listSessions().map((session) => ({
    id: session.id,
    createdAt: session.createdAt,
    deathCode: session.deathCode,
    status: session.revive.status,
    runId: session.revive.id,
    recoveryCase: session.revive.recoveryCase,
    completedSteps: session.revive.metrics.completedSteps,
    totalSteps: session.revive.steps.length,
    recoveredMs: session.revive.metrics.recoveredMs,
    generation: session.revive.token.generation,
    deduplicatedActions: session.revive.metrics.deduplicatedActions,
  }));
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  if (!sessionFromCookies(req.cookies)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const session = startSession(failureStep, deathCode);
  return NextResponse.json({
    sessionId: session.id,
    failureStep: session.failureStep,
    deathCode: session.deathCode,
  });
}
