// Per-workspace, non-secret configuration. First consumer: the approval policy
// that decides which agent actions must pause for a human before they run.
//
// "The user decides" — instead of a hardcoded list, each workspace picks a mode
// and can name its own require/allow patterns. Stored as plain jsonb (hosted)
// or a local JSON file (dev), mirroring how the control plane persists state.

import path from "node:path";
import fs from "node:fs";
import { hostedDatabaseEnabled, withWorkspaceTransaction } from "@/lib/hosted";
import { deriveActionClass } from "@/lib/policy";
import type { ActionRiskContext } from "@/lib/action-contracts";

export type ApprovalMode = "off" | "high_risk" | "all_mutations" | "custom";
export type OutboundApprovalMode = "off" | "all" | "bulk";

export interface ApprovalGuardrails {
  /** Apply to actions whose contract reports an outbound message. */
  outboundMessages: OutboundApprovalMode;
  /** Used only when outboundMessages is "bulk". */
  bulkRecipientThreshold: number;
  monetaryActions: boolean;
  destructiveActions: boolean;
  productionChanges: boolean;
}

export interface ApprovalPolicy {
  /** off: never require approval. high_risk: payments/email/deletes and any
   *  requirePattern. all_mutations: everything that is not read-only. custom:
   *  only the named requirePatterns. */
  mode: ApprovalMode;
  /** Action-key substrings that always require approval (case-insensitive). */
  requirePatterns: string[];
  /** Action-key substrings that never require approval; wins over everything. */
  allowPatterns: string[];
  /** Typed action facts supplied by a supported SDK or the MCP gateway. */
  guardrails: ApprovalGuardrails;
}

export interface WorkspaceConfig {
  approvalPolicy: ApprovalPolicy;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  mode: "high_risk",
  requirePatterns: [],
  allowPatterns: [],
  guardrails: {
    outboundMessages: "bulk",
    bulkRecipientThreshold: 25,
    monetaryActions: true,
    destructiveActions: true,
    productionChanges: true,
  },
};

/** Normalize untrusted policy input before it reaches a decision or storage. */
export function normalizeApprovalPolicy(raw: unknown): ApprovalPolicy {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<ApprovalPolicy>;
  const mode: ApprovalMode = ["off", "high_risk", "all_mutations", "custom"].includes(value.mode as string)
    ? (value.mode as ApprovalMode)
    : DEFAULT_APPROVAL_POLICY.mode;
  const clean = (list: unknown): string[] =>
    Array.isArray(list)
      ? list.map((item) => String(item).trim().toLowerCase()).filter(Boolean).slice(0, 50)
      : [];
  const guardrails = value.guardrails && typeof value.guardrails === "object"
    ? value.guardrails as Partial<ApprovalGuardrails>
    : {};
  const outboundMessages: OutboundApprovalMode = ["off", "all", "bulk"].includes(guardrails.outboundMessages as string)
    ? guardrails.outboundMessages as OutboundApprovalMode
    : DEFAULT_APPROVAL_POLICY.guardrails.outboundMessages;
  const bulkRecipientThreshold = typeof guardrails.bulkRecipientThreshold === "number" && Number.isFinite(guardrails.bulkRecipientThreshold)
    ? Math.max(1, Math.min(100_000, Math.floor(guardrails.bulkRecipientThreshold)))
    : DEFAULT_APPROVAL_POLICY.guardrails.bulkRecipientThreshold;
  return {
    mode,
    requirePatterns: clean(value.requirePatterns),
    allowPatterns: clean(value.allowPatterns),
    guardrails: {
      outboundMessages,
      bulkRecipientThreshold,
      monetaryActions: typeof guardrails.monetaryActions === "boolean" ? guardrails.monetaryActions : DEFAULT_APPROVAL_POLICY.guardrails.monetaryActions,
      destructiveActions: typeof guardrails.destructiveActions === "boolean" ? guardrails.destructiveActions : DEFAULT_APPROVAL_POLICY.guardrails.destructiveActions,
      productionChanges: typeof guardrails.productionChanges === "boolean" ? guardrails.productionChanges : DEFAULT_APPROVAL_POLICY.guardrails.productionChanges,
    },
  };
}

// ---- decision ----

export interface ApprovalDecision {
  required: boolean;
  source: "off" | "allow_pattern" | "require_pattern" | "guardrail" | "mode";
  reason: string;
}

/** Explains whether an action must wait for a human under workspace policy. */
export function evaluateApproval(policy: ApprovalPolicy, actionKey: string, risk?: ActionRiskContext): ApprovalDecision {
  const key = actionKey.toLowerCase();
  if (policy.mode === "off") return { required: false, source: "off", reason: "Workspace approvals are off" };
  if (policy.allowPatterns.some((pattern) => key.includes(pattern))) return { required: false, source: "allow_pattern", reason: "Matched never-require pattern" };
  if (policy.requirePatterns.some((pattern) => key.includes(pattern))) return { required: true, source: "require_pattern", reason: "Matched always-require pattern" };
  const outbound = risk?.operation === "outbound_message";
  const isBulk = (risk?.recipientCount || 0) >= policy.guardrails.bulkRecipientThreshold;
  if (
    (policy.guardrails.outboundMessages === "all" && outbound)
    || (policy.guardrails.outboundMessages === "bulk" && outbound && isBulk)
    || (policy.guardrails.monetaryActions && (risk?.monetary || risk?.operation === "money_movement"))
    || (policy.guardrails.destructiveActions && (risk?.destructive || risk?.operation === "destructive_change"))
    || (policy.guardrails.productionChanges && (risk?.production || risk?.operation === "production_change"))
  ) {
    return { required: true, source: "guardrail", reason: "Matched typed action guardrail" };
  }
  switch (policy.mode) {
    case "all_mutations":
      return { required: deriveActionClass(actionKey) !== "read_only", source: "mode", reason: "All mutations require approval" };
    case "custom":
      return { required: false, source: "mode", reason: "No custom rule matched" };
    case "high_risk":
    default:
      return {
        required: deriveActionClass(actionKey) === "high_risk",
        source: "mode",
        reason: "Action is classified by the high-risk policy",
      };
  }
}

/** Backward-compatible shorthand for the registration path. */
export function requiresApproval(policy: ApprovalPolicy, actionKey: string, risk?: ActionRiskContext): boolean {
  return evaluateApproval(policy, actionKey, risk).required;
}

// ---- persistence ----

const localDir = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
const localFile = path.join(localDir, "workspace-config.json");

function readLocal(): Record<string, WorkspaceConfig> {
  try {
    return JSON.parse(fs.readFileSync(localFile, "utf8"));
  } catch {
    return {};
  }
}

function writeLocal(data: Record<string, WorkspaceConfig>): void {
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(localFile, JSON.stringify(data, null, 2));
}

export async function getApprovalPolicy(workspaceId: string): Promise<ApprovalPolicy> {
  if (!hostedDatabaseEnabled()) {
    return normalizeApprovalPolicy(readLocal()[workspaceId]?.approvalPolicy);
  }
  try {
    return await withWorkspaceTransaction(workspaceId, async (sql) => {
      const rows = await sql<{ config: WorkspaceConfig }[]>`
        select config from revive_workspace_config where workspace_id = ${workspaceId}
      `;
      return normalizeApprovalPolicy(rows[0]?.config?.approvalPolicy);
    });
  } catch {
    // A config read must never block an action from being protected.
    return DEFAULT_APPROVAL_POLICY;
  }
}

export async function setApprovalPolicy(workspaceId: string, policy: ApprovalPolicy): Promise<ApprovalPolicy> {
  const clean = normalizeApprovalPolicy(policy);
  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    data[workspaceId] = { ...data[workspaceId], approvalPolicy: clean };
    writeLocal(data);
    return clean;
  }
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`
      insert into revive_workspace_config (workspace_id, config)
      values (${workspaceId}, ${sql.json(JSON.parse(JSON.stringify({ approvalPolicy: clean })))})
      on conflict (workspace_id) do update
      set config = revive_workspace_config.config || ${sql.json(JSON.parse(JSON.stringify({ approvalPolicy: clean })))},
          updated_at = now()
    `;
  });
  return clean;
}
