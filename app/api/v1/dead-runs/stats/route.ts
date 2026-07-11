import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { getDeadRunStats } from "@/lib/dead-runs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  const days = Number(req.nextUrl.searchParams.get("days") || 7);
  return NextResponse.json({ stats: await getDeadRunStats(auth.workspace.id, days, auth.projectId) });
}
