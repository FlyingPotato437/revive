import { NextRequest, NextResponse } from "next/server";
import { claimJobs, hostedDatabaseEnabled, queueHealth, recordWorkerHeartbeat } from "@/lib/hosted";
import { processJob } from "@/lib/webhooks";
import { timingSafeTextEqual } from "@/lib/secure-envelope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.REVIVE_WORKER_SECRET;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !timingSafeTextEqual(secret, supplied)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hostedDatabaseEnabled()) return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 503 });
  const workerId = req.headers.get("x-revive-worker-id") || "worker";
  try {
    const jobs = await claimJobs(Math.min(Number(req.nextUrl.searchParams.get("limit") || 10), 50));
    await Promise.all(jobs.map(processJob));
    await recordWorkerHeartbeat({ workerId, success: true, metadata: { claimed: jobs.length } });
    return NextResponse.json({ claimed: jobs.length, queue: await queueHealth() });
  } catch (error) {
    await recordWorkerHeartbeat({ workerId, success: false, consecutiveFailures: 1, metadata: { error: String(error) } }).catch(() => {});
    throw error;
  }
}
