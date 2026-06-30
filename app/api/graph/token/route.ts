import { NextRequest, NextResponse } from "next/server";
import { tokenEndpoint } from "@/lib/mock-graph";

export const dynamic = "force-dynamic";

/**
 * Real, inspectable mock of POST /oauth2/v2.0/token.
 * Pass ?dead=1&code=AADSTS700082 to forge the exact invalid_grant payload the
 * engine classifies. This is the same module the engine uses internally, so the
 * "mock Graph endpoint" in the demo is a genuine endpoint, not a UI string.
 *
 *   curl -s 'localhost:3000/api/graph/token?dead=1' | jq
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const dead = sp.get("dead") === "1" || sp.get("dead") === "true";
  const code = sp.get("code") || "AADSTS700082";
  const provider = (sp.get("provider") as "microsoft" | "google") || "microsoft";

  const res = tokenEndpoint({
    provider,
    refreshTokenDead: dead,
    deathCode: code,
    scopes: ["offline_access", "Files.Read.All"],
    generation: 1,
  });

  if (res.ok) {
    return NextResponse.json({
      token_type: "Bearer",
      expires_in: 3600,
      access_token: res.accessToken,
      scope: "offline_access Files.Read.All",
    });
  }
  return NextResponse.json(res.error, { status: res.status });
}
