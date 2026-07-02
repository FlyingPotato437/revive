import { NextRequest, NextResponse } from "next/server";
import { runRetention } from "@/lib/hosted";
import { timingSafeTextEqual } from "@/lib/secure-envelope";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.REVIVE_WORKER_SECRET;
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !timingSafeTextEqual(secret, supplied)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, deleted: await runRetention() });
}
