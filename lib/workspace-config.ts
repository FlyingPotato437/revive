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

export type ApprovalMode = "off" | "high_risk" | "all_mutations" | "custom";

export interface ApprovalPolicy {
  /** off: never require approval. high_risk: payments/email/deletes and any
   *  requirePattern. all_mutations: everything that is not read-only. custom:
   *  only the named requirePatterns. */
  mode: ApprovalMode;
  /** Action-key substrings that always require approval (case-insensitive). */
  requirePatterns: string[];
  /** Action-key substrings that never require approval; wins over everything. */
  allowPatterns: string[];
}

export interface WorkspaceConfig {
  approvalPolicy: ApprovalPolicy;
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = {
  mode: "high_risk",
  requirePatterns: [],
  allowPatterns: [],
};

function normalizePolicy(raw: unknown): ApprovalPolicy {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<ApprovalPolicy>;
  const mode: ApprovalMode = ["off", "high_risk", "all_mutations", "custom"].includes(value.mode as string)
    ? (value.mode as ApprovalMode)
    : DEFAULT_APPROVAL_POLICY.mode;
  const clean = (list: unknown): string[] =>
    Array.isArray(list)
      ? list.map((item) => String(item).trim().toLowerCase()).filter(Boolean).slice(0, 50)
      : [];
  return { mode, requirePatterns: clean(value.requirePatterns), allowPatterns: clean(value.allowPatterns) };
}

// ---- decision ----

/** Does this action key require a human approval under the workspace policy? */
export function requiresApproval(policy: ApprovalPolicy, actionKey: string): boolean {
  const key = actionKey.toLowerCase();
  if (policy.allowPatterns.some((pattern) => key.includes(pattern))) return false;
  if (policy.requirePatterns.some((pattern) => key.includes(pattern))) return true;
  switch (policy.mode) {
    case "off":
      return false;
    case "all_mutations":
      return deriveActionClass(actionKey) !== "read_only";
    case "custom":
      return false; // only requirePatterns matter
    case "high_risk":
    default:
      return deriveActionClass(actionKey) === "high_risk";
  }
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
    return normalizePolicy(readLocal()[workspaceId]?.approvalPolicy);
  }
  try {
    return await withWorkspaceTransaction(workspaceId, async (sql) => {
      const rows = await sql<{ config: WorkspaceConfig }[]>`
        select config from revive_workspace_config where workspace_id = ${workspaceId}
      `;
      return normalizePolicy(rows[0]?.config?.approvalPolicy);
    });
  } catch {
    // A config read must never block an action from being protected.
    return DEFAULT_APPROVAL_POLICY;
  }
}

export async function setApprovalPolicy(workspaceId: string, policy: ApprovalPolicy): Promise<ApprovalPolicy> {
  const clean = normalizePolicy(policy);
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
