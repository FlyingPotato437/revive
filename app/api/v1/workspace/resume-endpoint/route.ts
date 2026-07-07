import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { safeWebhookEndpoint } from "@/lib/webhooks";
import { clearResumeEndpoint, getResumeEndpoint, setResumeEndpoint } from "@/lib/workspace-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Runtime resume endpoint registration. Once registered, identity_verified
// fires a signed recovery.resume_requested callback at this URL and the case
// walks identity_verified -> resumed -> completed when the runtime acks.
// The shared secret is write-only: GET never returns it.

const MIN_SECRET_LENGTH = 16;
const MAX_SECRET_LENGTH = 256;

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  const config = await getResumeEndpoint(auth.workspace.id);
  return NextResponse.json(config ? { configured: true, url: config.url } : { configured: false });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req, "admin");
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const url = String(body.url || "").trim();
  const secret = String(body.secret || "");
  try {
    safeWebhookEndpoint(url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid endpoint URL" }, { status: 400 });
  }
  if (secret.length < MIN_SECRET_LENGTH || secret.length > MAX_SECRET_LENGTH) {
    return NextResponse.json(
      { error: `secret must be between ${MIN_SECRET_LENGTH} and ${MAX_SECRET_LENGTH} characters` },
      { status: 400 },
    );
  }
  try {
    await setResumeEndpoint(auth.workspace.id, { url, secret });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "could not store the resume endpoint" },
      { status: 503 },
    );
  }
  await audit({
    workspaceId: auth.workspace.id,
    actor: auth.keyPrefix,
    subjectKind: "connection",
    subjectId: auth.workspace.id,
    event: "resume_endpoint_registered",
    detail: { url },
  });
  return NextResponse.json({ configured: true, url });
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateApiKey(req, "admin");
  if (!auth.ok) return auth.response;
  await clearResumeEndpoint(auth.workspace.id);
  await audit({
    workspaceId: auth.workspace.id,
    actor: auth.keyPrefix,
    subjectKind: "connection",
    subjectId: auth.workspace.id,
    event: "resume_endpoint_cleared",
  });
  return NextResponse.json({ configured: false });
}
