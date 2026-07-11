import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { createOutcomeContract, listOutcomeContracts } from "@/lib/outcome-transactions";
import { TransitionError } from "@/lib/control-plane";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const resolved = await resolve(req, "viewer");
  if (!resolved.ok) return resolved.response;
  return NextResponse.json({ contracts: await listOutcomeContracts(resolved.workspaceId) });
}

export async function POST(req: NextRequest) {
  const resolved = await resolve(req, "admin");
  if (!resolved.ok) return resolved.response;
  try {
    const contract = await createOutcomeContract(resolved.workspaceId, await req.json());
    await audit({ workspaceId: resolved.workspaceId, actor: resolved.actor, subjectKind: "outcome_contract", subjectId: contract.id, event: "created", detail: { contractKey: contract.key, version: contract.version } });
    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    const status = error instanceof TransitionError ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "could not create outcome contract" }, { status });
  }
}

async function resolve(req: NextRequest, minimum: "viewer" | "admin") {
  const session = sessionFromCookies(req.cookies);
  if (!session) return { ok: false as const, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, minimum);
    return { ok: true as const, workspaceId: workspace.id, actor: session.email };
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return { ok: false as const, response: NextResponse.json({ error: error instanceof Error ? error.message : "workspace unavailable" }, { status }) };
  }
}
