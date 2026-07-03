import { NextRequest, NextResponse } from "next/server";
import { claimJobs, hostedDatabaseEnabled, queueHealth, recordWorkerHeartbeat } from "@/lib/hosted";
import { processJob } from "@/lib/webhooks";
import { timingSafeTextEqual } from "@/lib/secure-envelope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron entrypoint: drains the runtime-resume queue on a schedule so a
// serverless (Vercel) deployment needs no always-on worker process. Vercel
// invokes this with GET and Authorization: Bearer $CRON_SECRET. For manual or
// external triggers, REVIVE_WORKER_SECRET is also accepted.
async function drain(req: NextRequest): Promise<NextResponse> {
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const cronSecret = process.env.CRON_SECRET;
  const workerSecret = process.env.REVIVE_WORKER_SECRET;
  const authorized =
    (cronSecret && timingSafeTextEqual(cronSecret, supplied)) ||
    (workerSecret && timingSafeTextEqual(workerSecret, supplied));
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hostedDatabaseEnabled()) return NextResponse.json({ error: "DATABASE_URL is not configured" }, { status: 503 });

  let totalClaimed = 0;
  // A single cron tick drains in batches until the queue is empty or the
  // function is near its time budget, so bursts do not wait for the next tick.
  const deadline = Date.now() + 50_000;
  for (let round = 0; round < 20 && Date.now() < deadline; round += 1) {
    const jobs = await claimJobs(25);
    if (!jobs.length) break;
    await Promise.all(jobs.map(processJob));
    totalClaimed += jobs.length;
  }
  await recordWorkerHeartbeat({ workerId: "vercel-cron", success: true, metadata: { claimed: totalClaimed } }).catch(() => {});
  return NextResponse.json({ claimed: totalClaimed, queue: await queueHealth() });
}

export { drain as GET, drain as POST };
