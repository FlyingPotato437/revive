// Stripe billing: plan state on organizations, Checkout for upgrade, portal
// for management, webhook for truth. Uses the REST API directly (no SDK) so
// the restricted key surface stays explicit.

import crypto from "node:crypto";
import { hostedDatabaseEnabled, withWorkspaceTransaction } from "@/lib/hosted";

export type Plan = "free" | "dev" | "team" | "enterprise";
export type CheckoutPlan = "dev" | "team";
export const STRIPE_API_VERSION = "2026-02-25.clover";

export const PLAN_LIMITS: Record<Plan, { connections: number | null; casesPerMonth: number | null }> = {
  free: { connections: 1, casesPerMonth: 100 },
  dev: { connections: 3, casesPerMonth: 1_000 },
  team: { connections: 25, casesPerMonth: 10_000 },
  enterprise: { connections: null, casesPerMonth: null },
};

function priceId(plan: CheckoutPlan): string | undefined {
  return plan === "dev" ? process.env.STRIPE_PRICE_DEV : process.env.STRIPE_PRICE_TEAM;
}

function stripeConfigured(plan: CheckoutPlan): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && priceId(plan));
}

function normalizePlan(value: string | undefined): Plan {
  if (value === "dev" || value === "team" || value === "enterprise") return value;
  // The original paid plan was named Pro. Existing subscriptions retain
  // their entitlements as Team when this pricing model is deployed.
  if (value === "pro") return "team";
  return "free";
}

async function stripe(
  path: string,
  params?: Record<string, string>,
  options?: { idempotencyKey?: string },
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error as { message?: string } | undefined;
    throw new Error(error?.message || `Stripe request failed (${response.status})`);
  }
  return payload;
}

export async function organizationIdForWorkspace(workspaceId: string): Promise<string> {
  if (!hostedDatabaseEnabled()) return "org_local";
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<{ organization_id: string }[]>`
      select organization_id from revive_workspaces where id = ${workspaceId}
    `;
    if (!rows[0]) throw new Error("workspace not found");
    return rows[0].organization_id;
  });
}

export interface OrganizationBilling {
  plan: Plan;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

export async function getOrganizationBilling(workspaceId: string, organizationId: string): Promise<OrganizationBilling> {
  if (!hostedDatabaseEnabled()) return { plan: "free" };
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<{ plan: string; stripe_customer_id: string | null; stripe_subscription_id: string | null }[]>`
      select plan, stripe_customer_id, stripe_subscription_id from revive_organizations where id = ${organizationId}
    `;
    return {
      plan: normalizePlan(rows[0]?.plan),
      stripeCustomerId: rows[0]?.stripe_customer_id ?? undefined,
      stripeSubscriptionId: rows[0]?.stripe_subscription_id ?? undefined,
    };
  });
}

export async function createCheckoutSession(input: {
  workspaceId: string;
  organizationId: string;
  email: string;
  returnUrl: string;
  plan: CheckoutPlan;
}): Promise<string> {
  if (!stripeConfigured(input.plan)) {
    throw new Error(`billing is not configured for the ${input.plan} plan`);
  }
  const checkoutParams = {
    mode: "subscription",
    // Keep card explicit until the Stripe account finishes activating dynamic
    // payment methods. This still uses Stripe Checkout and never handles card
    // details inside Revive.
    "payment_method_types[0]": "card",
    "line_items[0][price]": priceId(input.plan)!,
    "line_items[0][quantity]": "1",
    customer_email: input.email,
    client_reference_id: input.organizationId,
    "metadata[organizationId]": input.organizationId,
    "metadata[workspaceId]": input.workspaceId,
    "metadata[plan]": input.plan,
    "subscription_data[metadata][organizationId]": input.organizationId,
    "subscription_data[metadata][workspaceId]": input.workspaceId,
    "subscription_data[metadata][plan]": input.plan,
    success_url: `${input.returnUrl}?billing=success`,
    cancel_url: `${input.returnUrl}?billing=cancelled`,
  };
  const requestHash = crypto.createHash("sha256").update(JSON.stringify(checkoutParams)).digest("hex");
  const session = await stripe("/checkout/sessions", checkoutParams, {
    idempotencyKey: `revive-checkout-${requestHash}`,
  });
  return String(session.url);
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripe("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  return String(session.url);
}

export async function setOrganizationPlan(workspaceId: string, organizationId: string, input: {
  plan: Plan;
  customerId?: string;
  subscriptionId?: string;
}): Promise<void> {
  if (!hostedDatabaseEnabled()) return;
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`
      update revive_organizations
      set plan = ${input.plan},
          stripe_customer_id = coalesce(${input.customerId ?? null}, stripe_customer_id),
          stripe_subscription_id = ${input.subscriptionId ?? null},
          plan_updated_at = now()
      where id = ${organizationId}
    `;
  });
}

export async function applyStripeBillingEvent(input: {
  eventId: string;
  eventType: string;
  workspaceId: string;
  organizationId: string;
  plan: Plan;
  customerId?: string;
  subscriptionId?: string;
}): Promise<boolean> {
  if (!hostedDatabaseEnabled()) return true;
  return withWorkspaceTransaction(input.workspaceId, async (sql) => {
    const claimed = await sql<{ id: string }[]>`
      insert into revive_billing_events (id, workspace_id, event_type)
      values (${input.eventId}, ${input.workspaceId}, ${input.eventType})
      on conflict (id) do nothing
      returning id
    `;
    if (!claimed.length) return false;
    await sql`
      update revive_organizations
      set plan = ${input.plan},
          stripe_customer_id = coalesce(${input.customerId ?? null}, stripe_customer_id),
          stripe_subscription_id = ${input.subscriptionId ?? null},
          plan_updated_at = now()
      where id = ${input.organizationId}
    `;
    return true;
  });
}

/** Stripe webhook signature check (v1 scheme, 5 minute tolerance). */
export function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = header.split(",").map((item) => item.split("=", 2) as [string, string]);
  const timestampText = parts.find(([key]) => key === "t")?.[1];
  const timestamp = Number(timestampText);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestampText}.${payload}`).digest("hex");
  const wanted = Buffer.from(expected, "hex");
  return parts.filter(([key]) => key === "v1").some(([, value]) => {
    const provided = Buffer.from(value || "", "hex");
    return provided.length === wanted.length && crypto.timingSafeEqual(provided, wanted);
  });
}
