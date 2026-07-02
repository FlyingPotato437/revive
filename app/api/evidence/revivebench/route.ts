import { NextRequest } from "next/server";
import benchmarkReport from "@/benchmarks/results/revivebench-local.json";
import liveCertification from "@/benchmarks/results/revive-certification-live.json";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const download = request.nextUrl.searchParams.get("download") === "1";
  const live = request.nextUrl.searchParams.get("artifact") === "live";
  const report = live ? liveCertification : benchmarkReport;
  return new Response(`${JSON.stringify(report, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
      ...(download ? { "content-disposition": `attachment; filename=${live ? "revive-certification-live.json" : "revivebench-local.json"}` } : {}),
    },
  });
}
