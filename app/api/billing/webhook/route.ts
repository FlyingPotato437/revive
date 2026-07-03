import { NextRequest, NextResponse } from "next/server";
import { setOrganizationPlan, verifyStripeSignature } from "@/lib/billing";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/billing/webhook — Stripe is the source of truth for plan state.
// Configure the endpoint in the Stripe dashboard pointing at
// $REVIVE_PUBLIC_URL/api/billing/webhook and set STRIPE_WEBHOOK_SECRET.
// Events handled: checkout.session.completed (upgrade),
// customer.subscription.deleted / .canceled (downgrade).
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  const object = event.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const organizationId = metadata.organizationId;
  const workspaceId = metadata.workspaceId;
  if (!organizationId || !workspaceId) return NextResponse.json({ received: true, skipped: "no metadata" });

  if (event.type === "checkout.session.completed") {
    await setOrganizationPlan(workspaceId, organizationId, {
      plan: "pro",
      customerId: typeof object.customer === "string" ? object.customer : undefined,
      subscriptionId: typeof object.subscription === "string" ? object.subscription : undefined,
    });
    await audit({ workspaceId, actor: "stripe", subjectKind: "billing", subjectId: organizationId, event: "plan_upgraded", detail: { plan: "pro" } });
  } else if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.canceled") {
    await setOrganizationPlan(workspaceId, organizationId, { plan: "free" });
    await audit({ workspaceId, actor: "stripe", subjectKind: "billing", subjectId: organizationId, event: "plan_downgraded", detail: { plan: "free", reason: event.type } });
  }
  return NextResponse.json({ received: true });
}
