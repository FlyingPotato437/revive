import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";
import { formatProtectionSummary, getProtectionStats } from "@/lib/protection-stats";

export const dynamic = "force-dynamic";

// GET /v1/stats/protection — the counter, from real ledgers. Used by the
// console strip and the weekly summary job.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req, "viewer");
  if (!auth.ok) return auth.response;
  const stats = await getProtectionStats(auth.workspace.id);
  return NextResponse.json({ ...stats, summary: formatProtectionSummary(stats) });
}
