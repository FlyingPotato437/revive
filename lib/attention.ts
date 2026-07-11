import { actionApproval, type ControlAction, type ControlCase } from "@/lib/control-plane";
import type { DeadQueueJob, WorkspaceConnectionSummary } from "@/lib/hosted";
import type { ApprovalPolicy } from "@/lib/workspace-config";
import type { OutcomeTransaction } from "@/lib/outcome-transactions";
import type { UserActionRequest } from "@/lib/action-requests";
import type { DeadRunRecord } from "@/lib/dead-runs";

export type AttentionKind = "dead_run" | "action_request" | "approval" | "transaction_approval" | "transaction_exception" | "uncertain_action" | "recovery" | "delivery";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  href?: string;
  actionId?: string;
  transactionId?: string;
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
  transactions?: OutcomeTransaction[];
  actionRequests?: UserActionRequest[];
  deadRuns?: DeadRunRecord[];
  now?: number;
}): AttentionItem[] {
  const now = input.now ?? Date.now();
  const items: AttentionItem[] = [];

  for (const run of input.deadRuns ?? []) {
    if (run.status !== "detected" || !run.recoverable) continue;
    items.push({
      id: `dead-run:${run.id}`,
      kind: "dead_run",
      title: `Revive ${run.runId}`,
      detail: `${run.category.replaceAll("_", " ")} · send the smallest ask to ${run.suggestedRecipientRole}`,
      href: "/app/detector",
      updatedAt: run.updatedAt,
    });
  }

  for (const request of input.actionRequests ?? []) {
    if (request.status !== "pending") continue;
    items.push({
      id: `action-request:${request.id}`,
      kind: "action_request",
      title: `Waiting on ${request.recipient.email}`,
      detail: `${request.title} · expires ${new Date(request.expiresAt).toLocaleDateString()}`,
      href: `/app/requests/${request.id}`,
      updatedAt: request.updatedAt,
    });
  }

  for (const transaction of input.transactions ?? []) {
    if (transaction.state === "awaiting_approval") {
      items.push({
        id: `transaction-approval:${transaction.id}`,
        kind: "transaction_approval",
        title: `Approve ${transaction.title}`,
        detail: `${transaction.steps.length} planned changes will settle as one outcome.`,
        href: `/app/transactions/${transaction.id}`,
        transactionId: transaction.id,
        updatedAt: transaction.approval?.requestedAt || transaction.updatedAt,
      });
    }
    if (transaction.state === "recovering" || transaction.state === "needs_human") {
      const unresolved = transaction.steps.filter((step) => step.state === "unknown" || step.state === "failed").length;
      items.push({
        id: `transaction-exception:${transaction.id}`,
        kind: "transaction_exception",
        title: `Settle ${transaction.title}`,
        detail: `${unresolved || 1} step${unresolved === 1 ? "" : "s"} could not be proved automatically.`,
        href: `/app/transactions/${transaction.id}`,
        transactionId: transaction.id,
        updatedAt: transaction.updatedAt,
      });
    }
  }

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
    dead_run: 0,
    action_request: 0,
    approval: 0,
    transaction_approval: 0,
    transaction_exception: 1,
    uncertain_action: 2,
    recovery: 3,
    delivery: 4,
  };
  return items.sort((a, b) => priority[a.kind] - priority[b.kind] || a.updatedAt - b.updatedAt);
}

export function buildReadiness(input: {
  activeApiKeys: number;
  actions: ControlAction[];
  connections: WorkspaceConnectionSummary[];
  policy: ApprovalPolicy;
  resumeEndpointConfigured: boolean;
  actionRequests?: UserActionRequest[];
  deadRuns?: DeadRunRecord[];
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
      id: "first-dead-run",
      label: "Send one dead run",
      detail: "Point an existing interrupt at the free detector.",
      href: "/app/quickstart",
      done: Boolean(input.deadRuns?.length),
    },
    {
      id: "first-action",
      label: "Create an action request",
      detail: "Ask one real user to unblock a paused agent run.",
      href: "/app/requests",
      done: Boolean(input.actionRequests?.length),
    },
    {
      id: "policy",
      label: "Choose an escalation policy",
      detail: "Decide when agent writes or blockers need a person.",
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
