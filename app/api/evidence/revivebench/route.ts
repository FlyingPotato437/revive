import { NextRequest } from "next/server";
import benchmarkReport from "@/benchmarks/results/revivebench-local.json";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new Response(`${JSON.stringify(benchmarkReport, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
      ...(download ? { "content-disposition": "attachment; filename=revivebench-local.json" } : {}),
    },
  });
}
