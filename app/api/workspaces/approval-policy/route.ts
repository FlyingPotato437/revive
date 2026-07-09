import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { getApprovalPolicy, setApprovalPolicy, type ApprovalMode } from "@/lib/workspace-config";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MODES: ApprovalMode[] = ["off", "high_risk", "all_mutations", "custom"];

// GET returns the workspace approval policy. POST (admin) updates it.
export async function GET(req: NextRequest) {
  const { workspaceId, error } = await resolve(req, "viewer");
  if (error) return error;
  return NextResponse.json({ policy: await getApprovalPolicy(workspaceId) });
}

export async function POST(req: NextRequest) {
  const { workspaceId, actor, error } = await resolve(req, "admin");
  if (error) return error;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const mode = body.mode as ApprovalMode;
  if (!MODES.includes(mode)) {
    return NextResponse.json({ error: `mode must be one of ${MODES.join(", ")}` }, { status: 400 });
  }
  const asList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => String(item)) : typeof value === "string" ? value.split(",") : [];
  const policy = await setApprovalPolicy(workspaceId, {
    mode,
    requirePatterns: asList(body.requirePatterns),
    allowPatterns: asList(body.allowPatterns),
  });
  await audit({ workspaceId, actor: actor!, subjectKind: "workspace", subjectId: workspaceId, event: "approval_policy_updated", detail: { mode: policy.mode, requireCount: policy.requirePatterns.length, allowCount: policy.allowPatterns.length } });
  return NextResponse.json({ policy });
}

async function resolve(req: NextRequest, minimum: "viewer" | "admin") {
  const session = sessionFromCookies(req.cookies);
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, minimum);
    return { workspaceId: workspace.id, actor: session.email } as const;
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return { error: NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status }) } as const;
  }
}
