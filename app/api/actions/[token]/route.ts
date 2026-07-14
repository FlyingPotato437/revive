import { NextRequest, NextResponse } from "next/server";
import { completeUserActionRequest, getUserActionRequestByToken, toPublicUserAction, validateUserActionResponse } from "@/lib/action-requests";
import { sessionFromCookies } from "@/lib/auth";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";
import { processCompletedUserAction } from "@/lib/webhooks";
import { validateResolution } from "@/lib/resolution-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const request = await getUserActionRequestByToken(token);
  if (request?.identityMode === "authenticated" && sessionFromCookies(req.cookies)?.email.toLowerCase() !== request.recipient.email) {
    const denied = NextResponse.json({ error: "sign in as the requested recipient" }, { status: 403 });
    denied.headers.set("cache-control", "private, no-store");
    return denied;
  }
  const response = request ? NextResponse.json({ request: toPublicUserAction(request) }) : NextResponse.json({ error: "action link is invalid or no longer available" }, { status: 404 });
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = await req.json();
    const before = await getUserActionRequestByToken(token);
    if (!before) throw new TransitionError("action link is invalid", 404);
    const authenticatedEmail = sessionFromCookies(req.cookies)?.email;
    if (before.identityMode === "authenticated" && authenticatedEmail?.toLowerCase() !== before.recipient.email) {
      throw new TransitionError("sign in as the requested recipient", 403);
    }
    let validationResult = before.validationResult;
    let submittedResponse = body.response;
    if (before.status === "pending") {
      const normalized = validateUserActionResponse(before, body.response);
      validationResult = await validateResolution({ request: before, response: normalized });
      if (!validationResult.valid) {
        await audit({ workspaceId: before.workspaceId, actor: authenticatedEmail || "secure-link", subjectKind: "action_request", subjectId: before.id, event: "response_rejected", detail: { feedback: validationResult.feedback, classifier: validationResult.classifier } });
        return NextResponse.json({ error: validationResult.feedback, validation: validationResult }, { status: 422 });
      }
      submittedResponse = normalized;
    }
    let request = await completeUserActionRequest(token, {
      generation: Number(body.generation), response: submittedResponse,
      authenticatedEmail, validationResult,
    });
    request = await processCompletedUserAction(request.workspaceId, request.id);
    await audit({
      workspaceId: request.workspaceId, actor: request.completedBy?.email || "secure-link", subjectKind: "action_request", subjectId: request.id,
      event: before?.status === "completed" ? "completion_replayed" : "completed", detail: { runId: request.runId, checkpointId: request.checkpointId, generation: request.generation, responseFields: Object.keys(request.response || {}), resumeStatus: request.resumeStatus },
    });
    const response = NextResponse.json({ request: toPublicUserAction(request) });
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not complete action" }, { status });
  }
}
