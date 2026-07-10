// Compact, privacy-preserving facts about a tool action. These are intentionally
// not a copy of tool arguments: a policy needs to know that an action targets
// 40 recipients or production, not the message body, customer names, or tokens.

export type ActionOperation =
  | "outbound_message"
  | "money_movement"
  | "destructive_change"
  | "production_change"
  | "unknown";

export interface ActionRiskContext {
  operation?: ActionOperation;
  recipientCount?: number;
  destructive?: boolean;
  monetary?: boolean;
  production?: boolean;
}

const OPERATIONS = new Set<ActionOperation>([
  "outbound_message",
  "money_movement",
  "destructive_change",
  "production_change",
  "unknown",
]);

/** Accept only the small set of facts Revive is allowed to persist. */
export function normalizeRiskContext(raw: unknown): ActionRiskContext | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const context: ActionRiskContext = {};
  if (typeof source.operation === "string" && OPERATIONS.has(source.operation as ActionOperation)) {
    context.operation = source.operation as ActionOperation;
  }
  if (typeof source.recipientCount === "number" && Number.isFinite(source.recipientCount)) {
    context.recipientCount = Math.max(0, Math.min(100_000, Math.floor(source.recipientCount)));
  }
  for (const field of ["destructive", "monetary", "production"] as const) {
    if (typeof source[field] === "boolean") context[field] = source[field];
  }
  return Object.keys(context).length ? context : undefined;
}

export function riskLabels(context?: ActionRiskContext): string[] {
  if (!context) return [];
  const labels: string[] = [];
  if (context.operation === "outbound_message") {
    labels.push(context.recipientCount ? `outbound to ${context.recipientCount}` : "outbound message");
  }
  if (context.monetary || context.operation === "money_movement") labels.push("money movement");
  if (context.destructive || context.operation === "destructive_change") labels.push("destructive");
  if (context.production || context.operation === "production_change") labels.push("production");
  return labels;
}

/** A console-safe approval description. It is derived from an action key and
 * contract facts, never accepted from raw caller arguments. */
export function approvalSummary(actionKey: string, context?: ActionRiskContext): string {
  const facts = riskLabels(context);
  return facts.length ? `${actionKey}: ${facts.join(", ")}` : `${actionKey}: protected action`;
}

export const ACTION_CONTRACTS = [
  {
    id: "outbound-message",
    title: "Outbound message",
    facts: "Recipient count only",
    policy: "Approve all sends or only bulk sends",
    examples: "send email, post message, invite user",
  },
  {
    id: "money-movement",
    title: "Money movement",
    facts: "A monetary action occurred",
    policy: "Require a human before the provider call",
    examples: "charge, refund, transfer, payout",
  },
  {
    id: "destructive-change",
    title: "Destructive change",
    facts: "The action removes or revokes state",
    policy: "Block for approval under the workspace policy",
    examples: "delete, revoke, cancel, terminate",
  },
  {
    id: "production-change",
    title: "Production change",
    facts: "The action targets a production environment",
    policy: "Route deployments and releases to the approval inbox",
    examples: "deploy production, release, publish",
  },
] as const;
