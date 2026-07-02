import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { allowedNangoIntegrations, createNangoConnectSession } from "@/lib/integrations/nango";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "nango:connect-session", 20, 60);
  if (limited) return limited;
  const user = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const body = await req.json() as { integrations?: unknown; organizationId?: unknown };
    // Server-side allowlist: browsers must not pick arbitrary Nango
    // integration ids. Configure NANGO_ALLOWED_INTEGRATIONS (comma-separated).
    const allowlist = allowedNangoIntegrations();
    const requested = Array.isArray(body.integrations)
      ? body.integrations.filter((item): item is string => typeof item === "string" && /^[a-zA-Z0-9_-]+$/.test(item)).slice(0, 20)
      : [];
    const integrations = requested.length
      ? requested.filter((item) => allowlist.includes(item))
      : allowlist;
    if (!integrations.length) {
      return NextResponse.json({ error: "requested integrations are not in the server allowlist" }, { status: 400 });
    }
    const result = await createNangoConnectSession({
      endUser: { id: user.email, email: user.email },
      organization: typeof body.organizationId === "string" ? { id: body.organizationId } : undefined,
      allowedIntegrations: integrations,
      integrationDefaults: integrations.includes("microsoft-tenant-specific") && process.env.ENTRA_TENANT_ID
        ? {
            "microsoft-tenant-specific": {
              connectionConfig: { tenant: process.env.ENTRA_TENANT_ID },
            },
          }
        : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nango request failed" }, { status: 502 });
  }
}
