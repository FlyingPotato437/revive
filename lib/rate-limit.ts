import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hostedDatabaseEnabled, sqlClient } from "./hosted";

type Bucket = { windowId: number; hits: number };
type RateGlobal = typeof globalThis & { __reviveRateLimits?: Map<string, Bucket> };

function clientAddress(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "local";
}

export async function enforceRateLimit(
  req: NextRequest,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowId = Math.floor(nowSeconds / windowSeconds);
  const bucketHash = crypto.createHash("sha256").update(`${scope}:${clientAddress(req)}`).digest("hex");
  let hits: number;

  if (hostedDatabaseEnabled()) {
    try {
      const rows = await sqlClient()<{ hits: number }[]>`
        insert into revive_rate_limits (bucket_hash, window_id, hits, expires_at)
        values (${bucketHash}, ${windowId}, 1, to_timestamp(${(windowId + 2) * windowSeconds}))
        on conflict (bucket_hash, window_id) do update set hits = revive_rate_limits.hits + 1
        returning hits
      `;
      hits = rows[0]?.hits || 1;
    } catch (error) {
      console.error("durable rate limit unavailable, using process fallback", error);
      hits = memoryHit(bucketHash, windowId);
    }
  } else {
    hits = memoryHit(bucketHash, windowId);
  }

  if (hits <= limit) return null;
  const retryAfter = Math.max(1, (windowId + 1) * windowSeconds - nowSeconds);
  return NextResponse.json(
    { error: "rate_limited", retryAfter },
    { status: 429, headers: { "retry-after": String(retryAfter), "cache-control": "no-store" } },
  );
}

function memoryHit(key: string, windowId: number): number {
  const global = globalThis as RateGlobal;
  const buckets = global.__reviveRateLimits ?? (global.__reviveRateLimits = new Map());
  const current = buckets.get(key);
  if (!current || current.windowId !== windowId) {
    buckets.set(key, { windowId, hits: 1 });
    return 1;
  }
  current.hits += 1;
  if (buckets.size > 10_000) {
    for (const [bucketKey, value] of buckets) if (value.windowId < windowId - 1) buckets.delete(bucketKey);
  }
  return current.hits;
}
