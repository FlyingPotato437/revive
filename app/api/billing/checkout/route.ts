import { NextRequest, NextResponse } from "next/server";
import { sessionFromCookies } from "@/lib/auth";
import { selectedWorkspace, WORKSPACE_COOKIE } from "@/lib/workspaces";
import { requireWorkspaceRole } from "@/lib/rbac";
import { createCheckoutSession, createPortalSession, getOrganizationBilling, organizationIdForWorkspace } from "@/lib/billing";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/billing/checkout — owner/admin starts a Pro subscription.
// Already subscribed → Stripe billing portal instead.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "billing:checkout", 10, 60);
  if (limited) return limited;
  const session = sessionFromCookies(req.cookies);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const workspace = await selectedWorkspace(session.email, req.cookies.get(WORKSPACE_COOKIE)?.value);
    await requireWorkspaceRole(session.email, workspace, "admin");
    const returnUrl = `${req.nextUrl.origin}/app/usage`;
    const organizationId = await organizationIdForWorkspace(workspace.id);
    const billing = await getOrganizationBilling(workspace.id, organizationId);
    const url = billing.stripeCustomerId
      ? await createPortalSession(billing.stripeCustomerId, returnUrl)
      : await createCheckoutSession({
          workspaceId: workspace.id,
          organizationId,
          email: session.email,
          returnUrl,
        });
    return NextResponse.json({ url });
  } catch (error) {
    const status = error instanceof Error && error.message === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "billing unavailable" }, { status });
  }
}
