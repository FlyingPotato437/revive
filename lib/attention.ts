import { actionApproval, type ControlAction, type ControlCase } from "@/lib/control-plane";
import type { DeadQueueJob, WorkspaceConnectionSummary } from "@/lib/hosted";
import type { ApprovalPolicy } from "@/lib/workspace-config";

export type AttentionKind = "approval" | "uncertain_action" | "recovery" | "delivery";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  href?: string;
  actionId?: string;
  jobId?: string;
  updatedAt: number;
}

export interface ReadinessItem {
  id: string;
  label: string;
  detail: string;
  href: string;
  done: boolean;
  optional?: boolean;
}

const TERMINAL_CASES = new Set(["completed", "rejected", "expired", "escalated", "manual_review"]);
const STALE_STARTED_MS = 5 * 60 * 1000;

/**
 * Build a small, transparent operational queue from real records. It is
 * intentionally not a health score: every item names the specific work that
 * requires a human or an explicit retry.
 */
export function buildAttentionQueue(input: {
  actions: ControlAction[];
  cases: ControlCase[];
  deadJobs: DeadQueueJob[];
  now?: number;
}): AttentionItem[] {
  const now = input.now ?? Date.now();
  const items: AttentionItem[] = [];

  for (const action of input.actions) {
    const approval = actionApproval(action);
    if (approval?.status === "pending") {
      items.push({
        id: `approval:${action.id}`,
        kind: "approval",
        title: `Approve ${action.actionKey}`,
        detail: approval.summary || "A protected action is waiting for a decision.",
        href: "/app/approvals",
        actionId: action.id,
        updatedAt: approval.requestedAt,
      });
    }
    const staleStarted = action.state === "started" && now - action.updatedAt >= STALE_STARTED_MS;
    if (action.state === "uncertain" || staleStarted) {
      items.push({
        id: `uncertain:${action.id}`,
        kind: "uncertain_action",
        title: `Reconcile ${action.actionKey}`,
        detail: "A prior attempt may have reached the provider. Verify the outcome before retrying.",
        href: `/app/actions/${action.id}`,
        actionId: action.id,
        updatedAt: action.updatedAt,
      });
    }
  }

  for (const recovery of input.cases) {
    if (TERMINAL_CASES.has(recovery.state)) continue;
    items.push({
      id: `recovery:${recovery.id}`,
      kind: "recovery",
      title: `Continue ${recovery.actionKey}`,
      detail: `${recovery.state.replaceAll("_", " ")} recovery for this run.`,
      href: `/app/runs/${recovery.id}`,
      updatedAt: recovery.updatedAt,
    });
  }

  for (const job of input.deadJobs) {
    items.push({
      id: `delivery:${job.id}`,
      kind: "delivery",
      title: "Retry a failed delivery",
      detail: `${job.kind.replaceAll("_", " ")} exhausted ${job.attempts} attempts.`,
      jobId: job.id,
      updatedAt: new Date(job.updatedAt).getTime(),
    });
  }

  const priority: Record<AttentionKind, number> = {
    approval: 0,
    uncertain_action: 1,
    recovery: 2,
    delivery: 3,
  };
  return items.sort((a, b) => priority[a.kind] - priority[b.kind] || a.updatedAt - b.updatedAt);
}

export function buildReadiness(input: {
  activeApiKeys: number;
  actions: ControlAction[];
  connections: WorkspaceConnectionSummary[];
  policy: ApprovalPolicy;
  resumeEndpointConfigured: boolean;
}): ReadinessItem[] {
  return [
    {
      id: "api-key",
      label: "Create an API key",
      detail: "Your gateway or SDK uses it to register actions.",
      href: "/app/api-keys",
      done: input.activeApiKeys > 0,
    },
    {
      id: "first-action",
      label: "Record a protected action",
      detail: "This is the real proof that an agent is using Revive.",
      href: "/app/quickstart",
      done: input.actions.length > 0,
    },
    {
      id: "policy",
      label: "Choose an approval policy",
      detail: "Decide which writes should wait for a human.",
      href: "/app/settings",
      done: input.policy.mode !== "off",
    },
    {
      id: "connection",
      label: "Connect an agent account",
      detail: "Optional until you need credential recovery.",
      href: "/app/connections",
      done: input.connections.some((connection) => connection.status === "active" || !connection.status),
      optional: true,
    },
    {
      id: "callback",
      label: "Register a resume callback",
      detail: "Optional until an external runtime needs recovery callbacks.",
      href: "/app/settings",
      done: input.resumeEndpointConfigured,
      optional: true,
    },
  ];
}
