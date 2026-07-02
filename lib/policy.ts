// Recovery policy engine: (action class, failure class, mutation state) →
// resume decision. Rules are evaluated top-down; the first match wins and the
// decision is recorded on the recovery case as resumePolicy so operators and
// runtimes see WHY a case resumes automatically, waits for approval, or blocks.
//
// Decisions:
//   auto_resume        → reconnect/retry and resume without a human
//   reconcile_first    → verify the side effect at the provider before resume
//   approval_required  → a named human must approve before resume
//   block              → never resume this attempt (e.g. wrong identity)
//   manual_repair      → open for operator repair; no automatic path

import type { FailureClass } from "./failure-classifier";

export type ResumeDecision =
  | "auto_resume"
  | "reconcile_first"
  | "approval_required"
  | "block"
  | "manual_repair";

/** Action sensitivity classes; matched against actionKey by pattern. */
export type ActionClass = "read_only" | "mutation" | "high_risk";

export interface PolicyInput {
  actionKey: string;
  failureClass: FailureClass;
  /** True when the side effect may already have been dispatched. */
  mutationDispatched?: boolean;
  /** Explicit override of the derived action class. */
  actionClass?: ActionClass;
}

export interface PolicyRule {
  /** Human-readable rule id recorded on the case. */
  id: string;
  match: (input: PolicyInput & { actionClass: ActionClass }) => boolean;
  decision: ResumeDecision;
}

// High-risk action keys: payments, deployments, anything customer-visible by
// default. Workspaces can extend via REVIVE_HIGH_RISK_ACTIONS (comma list of
// substrings) without a code change.
const HIGH_RISK_PATTERNS = ["payment", "refund", "charge", "deploy", "delete", "invoice", "sendmail", "send_email", "email"];

export function deriveActionClass(actionKey: string): ActionClass {
  const key = actionKey.toLowerCase();
  const extra = (process.env.REVIVE_HIGH_RISK_ACTIONS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if ([...HIGH_RISK_PATTERNS, ...extra].some((pattern) => key.includes(pattern))) return "high_risk";
  if (/^(get|read|list|fetch|search|query)/.test(key)) return "read_only";
  return "mutation";
}

export const DEFAULT_RULES: PolicyRule[] = [
  { id: "wrong-identity-blocks", match: ({ failureClass }) => failureClass === "wrong_identity", decision: "block" },
  { id: "partial-success-repairs", match: ({ failureClass }) => failureClass === "partial_success", decision: "manual_repair" },
  { id: "unknown-commit-reconciles", match: ({ failureClass }) => failureClass === "unknown_commit", decision: "reconcile_first" },
  { id: "high-risk-needs-approval", match: ({ actionClass }) => actionClass === "high_risk", decision: "approval_required" },
  {
    id: "mutation-after-dispatch-reconciles",
    match: ({ actionClass, mutationDispatched }) => actionClass === "mutation" && Boolean(mutationDispatched),
    decision: "reconcile_first",
  },
  { id: "rate-limit-auto-resumes", match: ({ failureClass }) => failureClass === "rate_limited", decision: "auto_resume" },
  { id: "read-only-auto-resumes", match: ({ actionClass }) => actionClass === "read_only", decision: "auto_resume" },
  // Credential failure on a not-yet-dispatched mutation: reconnect + resume.
  { id: "default-auto-resume", match: () => true, decision: "auto_resume" },
];

export interface PolicyResult {
  decision: ResumeDecision;
  ruleId: string;
  actionClass: ActionClass;
}

export function evaluatePolicy(input: PolicyInput, rules: PolicyRule[] = DEFAULT_RULES): PolicyResult {
  const actionClass = input.actionClass ?? deriveActionClass(input.actionKey);
  for (const rule of rules) {
    if (rule.match({ ...input, actionClass })) {
      return { decision: rule.decision, ruleId: rule.id, actionClass };
    }
  }
  // DEFAULT_RULES ends in a catch-all; custom rule sets may not.
  return { decision: "manual_repair", ruleId: "no-rule-matched", actionClass };
}
