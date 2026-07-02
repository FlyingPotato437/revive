// Tool-failure classifier: maps an external tool/provider error to a failure
// class and the recovery behavior Revive should drive. This is the general
// taxonomy the credential classifier (lib/classifier.ts) is one slice of.
//
// Failure classes and behaviors:
//   credential_rejected   → credential recovery (interactive reauth)
//   permission_changed    → permission recovery (admin/consent, not reauth)
//   rate_limited          → delayed resume (retry after backoff, no human)
//   transient_upstream    → retry; if a mutation was in flight, reconcile first
//   unknown_commit        → side-effect reconciliation before ANY retry
//   wrong_identity        → block resume (never continue with mismatched account)
//   partial_success       → manual repair case (some sub-effects committed)

export type FailureClass =
  | "credential_rejected"
  | "permission_changed"
  | "rate_limited"
  | "transient_upstream"
  | "unknown_commit"
  | "wrong_identity"
  | "partial_success";

export type RecoveryBehavior =
  | "credential_recovery"
  | "permission_recovery"
  | "delayed_resume"
  | "retry_or_reconcile"
  | "reconcile_side_effect"
  | "block_resume"
  | "manual_repair";

export interface ToolFailure {
  failureClass: FailureClass;
  behavior: RecoveryBehavior;
  /** Provider error code when one was recognizable (e.g. AADSTS700082, 429). */
  code?: string;
  reason: string;
  /** Suggested delay before resume for rate limits, seconds. */
  retryAfterSeconds?: number;
}

const BEHAVIOR: Record<FailureClass, RecoveryBehavior> = {
  credential_rejected: "credential_recovery",
  permission_changed: "permission_recovery",
  rate_limited: "delayed_resume",
  transient_upstream: "retry_or_reconcile",
  unknown_commit: "reconcile_side_effect",
  wrong_identity: "block_resume",
  partial_success: "manual_repair",
};

export interface ToolErrorShape {
  /** HTTP status if the tool call surfaced one. */
  status?: number;
  /** Provider error code (AADSTS…, invalid_grant, rate_limited…). */
  code?: string;
  message?: string;
  /** Retry-After header value in seconds, when the provider sent one. */
  retryAfterSeconds?: number;
  /** True when the caller knows a mutation was already dispatched. */
  mutationDispatched?: boolean;
  /** True when the provider reported some but not all sub-operations applied. */
  partial?: boolean;
  /** Provider-reported identity (subject/tenant) that failed a match check. */
  identityMismatch?: boolean;
}

export function classifyToolFailure(error: ToolErrorShape): ToolFailure {
  const lower = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  const make = (failureClass: FailureClass, reason: string): ToolFailure => ({
    failureClass,
    behavior: BEHAVIOR[failureClass],
    code: error.code || (error.status ? String(error.status) : undefined),
    reason,
    ...(failureClass === "rate_limited" ? { retryAfterSeconds: error.retryAfterSeconds ?? 60 } : {}),
  });

  // Explicit caller signals outrank status-code inference.
  if (error.identityMismatch) return make("wrong_identity", error.message || "authorized identity does not match the connection binding");
  if (error.partial) return make("partial_success", error.message || "provider applied some but not all sub-operations");

  if (error.status === 401 || lower.includes("invalid_grant") || lower.includes("aadsts") || lower.includes("token expired") || lower.includes("revoked")) {
    return make("credential_rejected", error.message || "credential rejected by provider");
  }
  if (error.status === 403 || lower.includes("insufficient") || lower.includes("consent") || lower.includes("forbidden")) {
    return make("permission_changed", error.message || "permission or consent changed at the provider");
  }
  if (error.status === 429 || lower.includes("rate limit") || lower.includes("throttl") || lower.includes("too many requests")) {
    return make("rate_limited", error.message || "provider rate limit");
  }
  if (error.status !== undefined && error.status >= 500) {
    // 5xx after a dispatched mutation means the commit state is unknown.
    return error.mutationDispatched
      ? make("unknown_commit", error.message || "provider failed after the mutation was dispatched; commit state unknown")
      : make("transient_upstream", error.message || `provider ${error.status}`);
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("econnreset") || lower.includes("socket hang up")) {
    return error.mutationDispatched
      ? make("unknown_commit", error.message || "timeout after the mutation was dispatched; commit state unknown")
      : make("transient_upstream", error.message || "network timeout");
  }
  // No recognizable signal after a dispatched mutation → treat as unknown
  // commit: reconciliation before retry is the only safe default.
  if (error.mutationDispatched) {
    return make("unknown_commit", error.message || "unrecognized failure after the mutation was dispatched");
  }
  return make("transient_upstream", error.message || "unclassified tool failure");
}
