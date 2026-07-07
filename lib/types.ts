// ---------------------------------------------------------------------------
// Revive core types shared between the engine, the API, and the UI.
// ---------------------------------------------------------------------------

export type Provider = "microsoft" | "google";

/** What the classifier decides about an auth error. */
export type Verdict =
  | "refreshable" // access token expired but refresh token is alive → silent refresh works
  | "dead" // refresh token is truly dead → out-of-band re-consent required
  | "transient" // throttling / 5xx → retry with backoff
  | "unknown"; // unrecognized; fail safe (treat as dead, ask a human)

export type StepStatus =
  | "pending"
  | "running"
  | "ok"
  | "refreshing"
  | "failed"
  | "checkpointed"
  | "resuming";

export type RunStatus =
  | "idle"
  | "running"
  | "refreshing"
  | "awaiting_reconsent" // Revive lane: parked, waiting for the out-of-band link
  | "stalled" // Baseline lane: silently reusing the stale token, looping forever
  | "resuming"
  | "completed"
  | "dead"; // baseline gave up

export type Lane = "baseline" | "revive";

export interface RunStep {
  id: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  label: string;
  detail: string;
  status: StepStatus;
  /** number of silent refresh / retry attempts spent on this step */
  attempts?: number;
  note?: string;
  startedAt?: number;
  endedAt?: number;
}

/** A durable, step-accurate snapshot taken the instant the token died. */
export interface Checkpoint {
  runId: string;
  takenAt: number;
  stepIndex: number;
  stepId: string;
  // the in-flight execution state we need to resume the exact step
  cursor: Record<string, unknown>;
  tokenFingerprint: string; // fingerprint of the dead token (never the secret)
  scopes: string[];
}

export interface ClassifierResult {
  verdict: Verdict;
  provider: Provider;
  oauthError: string; // top-level OAuth2 error, e.g. "invalid_grant"
  code: string; // provider sub-code, e.g. "AADSTS700082"
  title: string;
  reason: string;
  remediation: string;
  needsHuman: boolean;
  confidence: number; // 0..1
}

export interface TokenInfo {
  /** Opaque lease handle. Workers never receive the underlying refresh token. */
  leaseId: string;
  fingerprint: string;
  issuedAt: number;
  scopes: string[];
  generation: number; // fencing generation; stale workers cannot use older generations
  state: "active" | "revoked" | "rotating";
  /** Bound provider identity (Entra oid / tid). Set on first authorization
   * (trust-on-first-use); later recoveries must present the same identity.
   * Email is display metadata only and never used for binding. */
  subject?: string;
  tenant?: string;
}

export interface ReconsentTicket {
  id: string;
  runId: string;
  sessionId: string;
  provider: Provider;
  account: string;
  scopes: string[];
  url: string; // the URL-mode elicitation link
  reason: string;
  code: string;
  createdAt: number;
  expiresAt: number;
  status: "open" | "approved" | "expired";
}

export type RecoveryStatus =
  | "detected"
  | "parked"
  | "awaiting_user"
  | "reauthorized"
  | "resuming"
  | "recovered"
  | "expired"
  | "cancelled";

/** Durable control-plane record that joins identity failure to one logical run. */
export interface RecoveryCase {
  id: string;
  runId: string;
  provider: Provider;
  credentialLeaseId: string;
  failedStepId: string;
  status: RecoveryStatus;
  causeCode: string;
  policy: "silent_refresh" | "interactive_reauth" | "step_up" | "retry";
  openedAt: number;
  updatedAt: number;
  resolvedAt?: number;
  /** Real control-plane transition history (present for hosted /v1 cases). */
  events?: { at: number; from: string | null; to: string; note?: string; actor: string }[];
}

export interface ActionAttempt {
  id: string;
  runId: string;
  stepId: string;
  requestHash: string;
  idempotencyKey: string;
  state: "prepared" | "committed" | "reconciled";
  attempts: number;
  updatedAt: number;
}

export interface RunState {
  id: string;
  lane: Lane;
  status: RunStatus;
  steps: RunStep[];
  currentStep: number;
  token: TokenInfo;
  checkpoint?: Checkpoint;
  classifier?: ClassifierResult;
  ticket?: ReconsentTicket;
  recoveryCase?: RecoveryCase;
  actions: ActionAttempt[];
  metrics: {
    silentRetries: number;
    reconsents: number;
    restarts: number;
    leaseRotations: number;
    resumes: number;
    deduplicatedActions: number;
    staleTokenReuses: number;
    recoveredMs?: number;
    completedSteps: number;
  };
  startedAt?: number;
  endedAt?: number;
}

export interface SessionState {
  id: string;
  workspaceId?: string;
  projectId?: string;
  failureStep: number;
  deathCode?: string; // which provider error to forge (default AADSTS700082)
  createdAt: number;
  baseline: RunState;
  revive: RunState;
}

// --- Event stream (SSE) -----------------------------------------------------

export type ReviveEvent =
  | { type: "snapshot"; session: SessionState }
  | { type: "run"; lane: Lane; run: RunState }
  | {
      type: "log";
      lane: Lane;
      level: "info" | "warn" | "error" | "good";
      tag: string;
      message: string;
      at: number;
    }
  | { type: "done" };
