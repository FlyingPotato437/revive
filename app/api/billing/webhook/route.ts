import { NextRequest, NextResponse } from "next/server";
import { applyStripeBillingEvent, verifyStripeSignature, type Plan } from "@/lib/billing";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/billing/webhook — Stripe is the source of truth for plan state.
// Configure the endpoint in the Stripe dashboard pointing at
// $REVIVE_PUBLIC_URL/api/billing/webhook and set STRIPE_WEBHOOK_SECRET.
// Events handled: checkout completion plus subscription lifecycle changes.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const event = JSON.parse(payload) as { id: string; type: string; livemode?: boolean; data: { object: Record<string, unknown> } };
  if (!event.id) return NextResponse.json({ error: "event id missing" }, { status: 400 });
  const expectsLive = process.env.STRIPE_SECRET_KEY?.includes("_live_") ?? false;
  if (typeof event.livemode === "boolean" && event.livemode !== expectsLive) {
    return NextResponse.json({ error: "event mode mismatch" }, { status: 400 });
  }
  const object = event.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const organizationId = metadata.organizationId;
  const workspaceId = metadata.workspaceId;
  if (!organizationId || !workspaceId) return NextResponse.json({ received: true, skipped: "no metadata" });

  let plan: Plan | undefined;
  const paidPlan = metadata.plan === "dev" ? "dev" : "team";
  if (event.type === "checkout.session.completed") {
    const paymentStatus = String(object.payment_status || "");
    if (paymentStatus === "paid" || paymentStatus === "no_payment_required") plan = paidPlan;
  } else if (event.type === "customer.subscription.updated") {
    const status = String(object.status || "");
    plan = ["active", "trialing", "past_due"].includes(status) ? paidPlan : "free";
  } else if (event.type === "customer.subscription.deleted") {
    plan = "free";
  }
  if (!plan) return NextResponse.json({ received: true, skipped: "event does not change entitlements" });
  const applied = await applyStripeBillingEvent({
    eventId: event.id,
    eventType: event.type,
    workspaceId,
    organizationId,
    plan,
    customerId: typeof object.customer === "string" ? object.customer : undefined,
    subscriptionId: typeof object.subscription === "string"
      ? object.subscription
      : typeof object.id === "string" && event.type.startsWith("customer.subscription.") ? object.id : undefined,
  });
  if (applied) {
    await audit({ workspaceId, actor: "stripe", subjectKind: "billing", subjectId: organizationId, event: plan === "free" ? "plan_downgraded" : "plan_upgraded", detail: { plan, reason: event.type, stripeEventId: event.id } });
  }
  return NextResponse.json({ received: true, applied });
}

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET) });
}
