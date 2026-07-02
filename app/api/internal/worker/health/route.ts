import { NextRequest, NextResponse } from "next/server";
import { hostedDatabaseEnabled, queueHealth } from "@/lib/hosted";
import { timingSafeTextEqual } from "@/lib/secure-envelope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.REVIVE_HEALTH_SECRET || process.env.REVIVE_WORKER_SECRET;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !timingSafeTextEqual(secret, supplied)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hostedDatabaseEnabled()) return NextResponse.json({ status: "degraded", error: "DATABASE_URL is not configured" }, { status: 503 });
  const health = await queueHealth();
  const latest = health.workers[0];
  const stale = !latest || Date.now() - new Date(latest.lastSeenAt).getTime() > Number(process.env.REVIVE_WORKER_STALE_MS || 120_000);
  return NextResponse.json({ status: stale || health.dead > 0 ? "degraded" : "ok", stale, ...health }, { status: stale ? 503 : 200 });
}
