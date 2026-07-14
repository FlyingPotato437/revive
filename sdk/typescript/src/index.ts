import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export type RecoveryPolicy =
  | "interactive_reauth"
  | "step_up"
  | "retry"
  | "manual_reconcile";

export interface CredentialLease<TCredential = unknown> {
  connectionId: string;
  provider: string;
  accountId?: string;
  generation: number;
  credential: TCredential;
  scopes?: string[];
}

export interface RecoveryCase {
  id: string;
  runId: string;
  checkpointId?: string;
  connectionId: string;
  actionKey: string;
  idempotencyKey: string;
  provider?: string;
  policy: RecoveryPolicy;
  reason: string;
  url?: string;
  leaseGeneration?: number;
}

export type ActionRegistrationState = "new" | "completed" | "uncertain" | "reconciled";

export type ReplayVerdict =
  | "safe_to_execute"
  | "already_committed"
  | "reconcile_first"
  | "blocked_stale_generation";

export interface ActionRegistration {
  id: string;
  idempotencyKey: string;
  /** Ledger verdict for this idempotency key. Only "new" may execute. */
  state: ActionRegistrationState;
  /** Direct answer to "should this exact side effect run again?". */
  replayVerdict?: ReplayVerdict;
  /** Stored result reference for completed/reconciled actions. */
  resultRef?: string;
}

export type OutcomeTransactionState = "planned" | "awaiting_approval" | "executing" | "verifying" | "verified" | "recovering" | "compensated" | "needs_human" | "cancelled";
export type OutcomeStepState = "planned" | "executing" | "succeeded" | "verifying" | "verified" | "unknown" | "failed" | "compensating" | "compensated" | "skipped";
export interface OutcomeTransactionStep {
  id: string;
  key: string;
  actionKey: string;
  connectionId: string;
  state: OutcomeStepState;
  version: number;
  actionId?: string;
  remoteId?: string;
  expectedOutcome?: { key: string; label: string; provider?: string; expectedState?: string };
}
export interface OutcomeTransaction {
  id: string;
  runId: string;
  contractKey: string;
  idempotencyKey: string;
  title: string;
  state: OutcomeTransactionState;
  version: number;
  steps: OutcomeTransactionStep[];
  traceContext?: { provider?: string; traceId?: string; spanId?: string; traceUrl?: string };
}
export interface CreateOutcomeTransactionInput {
  runId: string;
  contractKey: string;
  idempotencyKey: string;
  title?: string;
  requireApproval?: boolean;
  inputRef?: string;
  traceContext?: OutcomeTransaction["traceContext"];
  steps: Array<{
    key: string;
    actionKey: string;
    connectionId: string;
    actionId?: string;
    reversible?: boolean;
    compensationActionKey?: string;
    expectedOutcome?: { key: string; label: string; provider?: string; expectedState?: string };
  }>;
}

export type UserActionType = "approval" | "structured_input" | "clarification" | "reauthorization" | "verification" | "permission" | "browser_handoff" | "document_request";
export type UserActionFieldType = "text" | "textarea" | "select" | "boolean" | "currency" | "email" | "url" | "date" | "file_url";
export interface UserActionField {
  key: string;
  type: UserActionFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  requiredWhen?: { field: string; equals: string | boolean };
}
export interface CreateUserActionRequestInput {
  runId: string;
  checkpointId?: string;
  generation?: number;
  idempotencyKey: string;
  actionType: UserActionType;
  title: string;
  description?: string;
  recipient: { subjectId: string; email: string; role?: string };
  fields?: UserActionField[];
  context?: Record<string, unknown>;
  identityMode?: "secure_link" | "authenticated";
  destinationUrl?: string;
  expiresIn?: string;
}
export interface UserActionRequest {
  id: string;
  runId: string;
  checkpointId?: string;
  generation: number;
  actionType: UserActionType;
  idempotencyKey: string;
  title: string;
  status: "pending" | "completed" | "cancelled" | "expired";
  recipient: { subjectId: string; email: string; role?: string };
  fields: UserActionField[];
  expiresAt: number;
  resumeStatus: "not_configured" | "queued" | "acknowledged" | "failed" | "held_for_review";
  url?: string;
  response?: Record<string, unknown>;
}

export type DeadRunCategory = "expired_oauth" | "missing_input" | "approval_needed" | "permission_denied" | "browser_intervention" | "ambiguous_side_effect" | "unknown";
export interface RecordDeadRunInput {
  runId: string;
  checkpointId?: string;
  generation?: number;
  idempotencyKey: string;
  runtime?: string;
  failureMessage: string;
  trace?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}
export interface DeadRunRecord {
  id: string;
  runId: string;
  checkpointId?: string;
  generation: number;
  runtime: string;
  category: DeadRunCategory;
  confidence: number;
  recoverable: boolean;
  suggestedActionType: UserActionType;
  suggestedRecipientRole: string;
  suggestedQuestion: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  status: "detected" | "resolution_requested" | "resolved" | "ignored";
  actionRequestId?: string;
}
export interface DeadRunStats {
  days: number;
  totalRunsLost: number;
  recoverableRuns: number;
  recoverableRate: number;
  wastedTokens: number;
  estimatedCostUsd: number;
  resolvedRuns: number;
  categories: Array<{ category: DeadRunCategory; count: number; share: number }>;
}

/** Provider probe fields attached at registration so recovery can auto-answer
 *  "did this side effect already happen?" before the run resumes. */
export interface ReconcileHints {
  provider?: "microsoft" | "google";
  subject?: string;
  internetMessageId?: string;
  messageId?: string;
  rfc822MessageId?: string;
  windowMinutes?: number;
}

/** Privacy-preserving facts used by workspace action policies. Never place raw
 * tool input, message content, recipient addresses, or money amounts here. */
export interface ActionRiskContext {
  operation?: "outbound_message" | "money_movement" | "destructive_change" | "production_change" | "unknown";
  recipientCount?: number;
  destructive?: boolean;
  monetary?: boolean;
  production?: boolean;
}

export interface ReconcileResult<TResult = unknown> {
  committed: boolean;
  value?: TResult;
  remoteId?: string;
  note?: string;
}

export interface ProtectedActionContext<TCredential = unknown> {
  runId: string;
  checkpointId?: string;
  connectionId: string;
  actionKey: string;
  idempotencyKey: string;
  credential: TCredential;
  signal?: AbortSignal;
}

export interface CredentialFailure {
  provider?: string;
  code?: string;
  reason: string;
  policy?: RecoveryPolicy;
}

export interface ProtectActionInput<TCredential, TResult> {
  runId: string;
  checkpointId?: string;
  connectionId: string;
  actionKey: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  /** Compact policy facts. Revive stores these facts, not raw action input. */
  riskContext?: ActionRiskContext;
  /** Provider probe fields so recovery can auto-reconcile before resume. */
  reconcileHints?: ReconcileHints;
  signal?: AbortSignal;
  credential: () => Promise<CredentialLease<TCredential>> | CredentialLease<TCredential>;
  execute: (context: ProtectedActionContext<TCredential>) => Promise<TResult>;
  reconcile?: (context: Omit<ProtectedActionContext<TCredential>, "credential">) => Promise<ReconcileResult<TResult>>;
  classifyError?: (error: unknown) => CredentialFailure | null | undefined;
  onRecoveryRequired?: (recoveryCase: RecoveryCase) => void | Promise<void>;
}

export type ProtectActionResult<TResult> =
  | {
      status: "completed";
      value: TResult;
      idempotencyKey: string;
      actionId: string;
      recoveredFromReconcile?: boolean;
      /** True when the ledger already held the outcome and execute() was skipped. */
      deduplicated?: boolean;
    }
  | {
      status: "parked";
      recoveryCase: RecoveryCase;
      idempotencyKey: string;
      actionId: string;
    };

export interface ReviveTransport {
  registerAction(input: {
    runId: string;
    checkpointId?: string;
    connectionId: string;
    actionKey: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    reconcileHints?: ReconcileHints;
    riskContext?: ActionRiskContext;
  }): Promise<ActionRegistration>;
  markStarted(input: { actionId: string; idempotencyKey: string }): Promise<void>;
  completeAction(input: {
    actionId: string;
    idempotencyKey: string;
    result?: unknown;
  }): Promise<void>;
  markReconciled(input: {
    actionId: string;
    idempotencyKey: string;
    remoteId?: string;
    note?: string;
  }): Promise<void>;
  openRecoveryCase(input: {
    runId: string;
    checkpointId?: string;
    connectionId: string;
    actionKey: string;
    idempotencyKey: string;
    provider?: string;
    policy: RecoveryPolicy;
    reason: string;
    leaseGeneration?: number;
    metadata?: Record<string, unknown>;
  }): Promise<RecoveryCase>;
  registerTransaction(input: CreateOutcomeTransactionInput): Promise<OutcomeTransaction>;
  transitionTransactionStep(input: { transactionId: string; stepKey: string; to: OutcomeStepState; expectedVersion: number; actionId?: string; remoteId?: string; evidence?: Record<string, unknown>; note?: string; resultSummary?: string }): Promise<OutcomeTransaction>;
  decideTransaction(input: { transactionId: string; decision: "approve" | "deny"; reason?: string }): Promise<OutcomeTransaction>;
  requestUserAction(input: CreateUserActionRequestInput): Promise<UserActionRequest>;
  getUserAction(id: string): Promise<UserActionRequest>;
  cancelUserAction(id: string): Promise<UserActionRequest>;
  recordDeadRun(input: RecordDeadRunInput): Promise<DeadRunRecord>;
  getDeadRunStats(days?: number): Promise<DeadRunStats>;
  resolveDeadRun(input: { deadRunId: string; recipient: { subjectId: string; email: string; role?: string }; destinationUrl?: string; expiresIn?: string }): Promise<{ deadRun: DeadRunRecord; request: UserActionRequest }>;
}

export interface ReviveClientOptions {
  transport?: ReviveTransport;
  /** Hosted control-plane base URL, e.g. https://console.revive.dev */
  baseUrl?: string;
  /** Workspace API key (rv_live_…). With baseUrl, selects the HTTP transport. */
  apiKey?: string;
}

export class ReviveClient {
  private transport: ReviveTransport;

  constructor(options: ReviveClientOptions = {}) {
    if (options.transport) {
      this.transport = options.transport;
    } else if (options.baseUrl) {
      this.transport = new HttpReviveTransport({ baseUrl: options.baseUrl, apiKey: options.apiKey });
    } else {
      this.transport = new MemoryReviveTransport();
    }
  }

  async protectAction<TCredential, TResult>(
    input: ProtectActionInput<TCredential, TResult>,
  ): Promise<ProtectActionResult<TResult>> {
    const idempotencyKey =
      input.idempotencyKey || createIdempotencyKey(input.runId, input.actionKey, input.checkpointId);
    const action = await this.transport.registerAction({
      runId: input.runId,
      checkpointId: input.checkpointId,
      connectionId: input.connectionId,
      actionKey: input.actionKey,
      idempotencyKey,
      metadata: input.metadata,
      reconcileHints: input.reconcileHints,
      riskContext: input.riskContext,
    });

    // Ledger verdict gate: never execute an action the control plane already
    // knows the outcome of. Only "new" may run the side effect.
    if (action.state === "completed" || action.state === "reconciled") {
      return {
        status: "completed",
        value: parseResultRef<TResult>(action.resultRef),
        idempotencyKey,
        actionId: action.id,
        recoveredFromReconcile: action.state === "reconciled",
        deduplicated: true,
      };
    }
    if (action.state === "uncertain") {
      // A previous attempt may have committed remotely. Reconcile before any replay.
      if (!input.reconcile) throw new AmbiguousCommitError();
      const reconciled = await input.reconcile({
        runId: input.runId,
        checkpointId: input.checkpointId,
        connectionId: input.connectionId,
        actionKey: input.actionKey,
        idempotencyKey,
        signal: input.signal,
      });
      if (reconciled.committed) {
        await this.transport.markReconciled({
          actionId: action.id,
          idempotencyKey,
          remoteId: reconciled.remoteId,
          note: reconciled.note,
        });
        return {
          status: "completed",
          value: reconciled.value as TResult,
          idempotencyKey,
          actionId: action.id,
          recoveredFromReconcile: true,
        };
      }
      // Confirmed not committed upstream: safe to execute below.
    }

    let lease: CredentialLease<TCredential>;
    try {
      lease = await input.credential();
    } catch (error) {
      const failure = classifyWith(input, error);
      if (!failure) throw error;
      return this.park(input, action, idempotencyKey, failure);
    }

    const context: ProtectedActionContext<TCredential> = {
      runId: input.runId,
      checkpointId: input.checkpointId,
      connectionId: input.connectionId,
      actionKey: input.actionKey,
      idempotencyKey,
      credential: lease.credential,
      signal: input.signal,
    };

    // Recorded immediately before the side effect. Everything up to here
    // (registration, credential acquisition, parking) leaves the action
    // "prepared", so those failures replay as safe "new" — not as an
    // ambiguous commit.
    await this.transport.markStarted({ actionId: action.id, idempotencyKey });

    try {
      const value = await input.execute(context);
      await this.transport.completeAction({ actionId: action.id, idempotencyKey, result: value });
      return { status: "completed", value, idempotencyKey, actionId: action.id };
    } catch (error) {
      if (error instanceof AmbiguousCommitError && input.reconcile) {
        const reconciled = await input.reconcile({
          runId: input.runId,
          checkpointId: input.checkpointId,
          connectionId: input.connectionId,
          actionKey: input.actionKey,
          idempotencyKey,
          signal: input.signal,
        });
        if (reconciled.committed) {
          await this.transport.markReconciled({
            actionId: action.id,
            idempotencyKey,
            remoteId: reconciled.remoteId,
            note: reconciled.note,
          });
          return {
            status: "completed",
            value: reconciled.value as TResult,
            idempotencyKey,
            actionId: action.id,
            recoveredFromReconcile: true,
          };
        }
      }

      const failure = classifyWith(input, error);
      if (!failure) throw error;
      return this.park(input, action, idempotencyKey, {
        ...failure,
        provider: failure.provider || lease.provider,
      }, lease.generation);
    }
  }

  /** Register one task-scoped operation spanning multiple protected actions. */
  createTransaction(input: CreateOutcomeTransactionInput): Promise<OutcomeTransaction> {
    return this.transport.registerTransaction(input);
  }

  /** Advance a transaction step only after the runtime has concrete execution
   * or provider-verification evidence for that state change. */
  transitionTransactionStep(input: { transactionId: string; stepKey: string; to: OutcomeStepState; expectedVersion: number; actionId?: string; remoteId?: string; evidence?: Record<string, unknown>; note?: string; resultSummary?: string }): Promise<OutcomeTransaction> {
    return this.transport.transitionTransactionStep(input);
  }

  decideTransaction(input: { transactionId: string; decision: "approve" | "deny"; reason?: string }): Promise<OutcomeTransaction> {
    return this.transport.decideTransaction(input);
  }

  /** Ask a specific person to unblock a suspended run. Revive returns a
   * single-use action URL and later emits a signed continuation event. */
  requestAction(input: CreateUserActionRequestInput): Promise<UserActionRequest> {
    return this.transport.requestUserAction(input);
  }

  getActionRequest(id: string): Promise<UserActionRequest> {
    return this.transport.getUserAction(id);
  }

  cancelActionRequest(id: string): Promise<UserActionRequest> {
    return this.transport.cancelUserAction(id);
  }

  /** Record one run that terminated at a human-dependent boundary. Trace is
   * redacted server-side before classification or storage. */
  detectDeadRun(input: RecordDeadRunInput): Promise<DeadRunRecord> {
    return this.transport.recordDeadRun(input);
  }

  deadRunStats(days = 7): Promise<DeadRunStats> {
    return this.transport.getDeadRunStats(days);
  }

  reviveDeadRun(input: Parameters<ReviveTransport["resolveDeadRun"]>[0]): Promise<{ deadRun: DeadRunRecord; request: UserActionRequest }> {
    return this.transport.resolveDeadRun(input);
  }

  private async park<TCredential, TResult>(
    input: ProtectActionInput<TCredential, TResult>,
    action: ActionRegistration,
    idempotencyKey: string,
    failure: CredentialFailure,
    leaseGeneration?: number,
  ): Promise<ProtectActionResult<TResult>> {
    const recoveryCase = await this.transport.openRecoveryCase({
      runId: input.runId,
      checkpointId: input.checkpointId,
      connectionId: input.connectionId,
      actionKey: input.actionKey,
      idempotencyKey,
      provider: failure.provider,
      policy: failure.policy || "interactive_reauth",
      reason: failure.code ? `${failure.code}: ${failure.reason}` : failure.reason,
      leaseGeneration,
      metadata: input.metadata,
    });
    await input.onRecoveryRequired?.(recoveryCase);
    return { status: "parked", recoveryCase, idempotencyKey, actionId: action.id };
  }
}

export class AmbiguousCommitError extends Error {
  constructor(message = "The remote side effect may have committed. Reconcile before retrying.") {
    super(message);
    this.name = "AmbiguousCommitError";
  }
}

export interface HttpReviveTransportOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export class HttpReviveTransport implements ReviveTransport {
  private baseUrl: string;
  private apiKey?: string;
  private fetchImpl: typeof fetch;

  constructor(options: HttpReviveTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch || fetch;
  }

  registerAction(input: Parameters<ReviveTransport["registerAction"]>[0]): Promise<ActionRegistration> {
    return this.request("/v1/actions", input);
  }

  markStarted(input: Parameters<ReviveTransport["markStarted"]>[0]): Promise<void> {
    return this.request(`/v1/actions/${encodeURIComponent(input.actionId)}/started`, input);
  }

  completeAction(input: Parameters<ReviveTransport["completeAction"]>[0]): Promise<void> {
    return this.request(`/v1/actions/${encodeURIComponent(input.actionId)}/complete`, input);
  }

  markReconciled(input: Parameters<ReviveTransport["markReconciled"]>[0]): Promise<void> {
    return this.request(`/v1/actions/${encodeURIComponent(input.actionId)}/reconciled`, input);
  }

  openRecoveryCase(input: Parameters<ReviveTransport["openRecoveryCase"]>[0]): Promise<RecoveryCase> {
    return this.request("/v1/recovery-cases", input);
  }

  async registerTransaction(input: CreateOutcomeTransactionInput): Promise<OutcomeTransaction> {
    const response = await this.request<{ transaction: OutcomeTransaction }>("/v1/transactions", input);
    return response.transaction;
  }

  async transitionTransactionStep(input: Parameters<ReviveTransport["transitionTransactionStep"]>[0]): Promise<OutcomeTransaction> {
    const response = await this.request<{ transaction: OutcomeTransaction }>(`/v1/transactions/${encodeURIComponent(input.transactionId)}/steps/${encodeURIComponent(input.stepKey)}`, input);
    return response.transaction;
  }

  async decideTransaction(input: Parameters<ReviveTransport["decideTransaction"]>[0]): Promise<OutcomeTransaction> {
    const response = await this.request<{ transaction: OutcomeTransaction }>(`/v1/transactions/${encodeURIComponent(input.transactionId)}/approval`, input);
    return response.transaction;
  }

  async requestUserAction(input: CreateUserActionRequestInput): Promise<UserActionRequest> {
    const response = await this.request<{ request: UserActionRequest }>("/v1/action-requests", input);
    return response.request;
  }

  async getUserAction(id: string): Promise<UserActionRequest> {
    const response = await this.fetchJson<{ request: UserActionRequest }>(`/v1/action-requests/${encodeURIComponent(id)}`, { method: "GET" });
    return response.request;
  }

  async cancelUserAction(id: string): Promise<UserActionRequest> {
    const response = await this.fetchJson<{ request: UserActionRequest }>(`/v1/action-requests/${encodeURIComponent(id)}`, { method: "DELETE" });
    return response.request;
  }

  async recordDeadRun(input: RecordDeadRunInput): Promise<DeadRunRecord> {
    const response = await this.request<{ run: DeadRunRecord }>("/v1/dead-runs", input);
    return response.run;
  }

  async getDeadRunStats(days = 7): Promise<DeadRunStats> {
    const response = await this.fetchJson<{ stats: DeadRunStats }>(`/v1/dead-runs/stats?days=${Math.max(1, Math.floor(days))}`, { method: "GET" });
    return response.stats;
  }

  async resolveDeadRun(input: Parameters<ReviveTransport["resolveDeadRun"]>[0]): Promise<{ deadRun: DeadRunRecord; request: UserActionRequest }> {
    const { deadRunId, ...body } = input;
    return this.request(`/v1/dead-runs/${encodeURIComponent(deadRunId)}/revive`, body);
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    return this.fetchJson<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  private async fetchJson<T>(path: string, init: { method: "GET" | "POST" | "DELETE"; body?: string }): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Revive request failed (${response.status}): ${text}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

export class MemoryReviveTransport implements ReviveTransport {
  readonly actions = new Map<string, ActionRegistration & Record<string, unknown>>();
  readonly recoveryCases = new Map<string, RecoveryCase>();
  readonly transactions = new Map<string, OutcomeTransaction>();
  readonly userActionRequests = new Map<string, UserActionRequest>();
  readonly deadRuns = new Map<string, DeadRunRecord>();

  async registerAction(input: Parameters<ReviveTransport["registerAction"]>[0]): Promise<ActionRegistration> {
    const id = `act_${hash(`${input.runId}:${input.actionKey}:${input.idempotencyKey}`)}`;
    const existing = this.actions.get(id);
    if (existing) {
      const previous = existing.state as ActionRegistrationState | "started" | undefined;
      if (previous === "completed" || previous === "reconciled") {
        return {
          id, idempotencyKey: input.idempotencyKey, state: previous, replayVerdict: "already_committed",
          resultRef: existing.result !== undefined ? JSON.stringify(existing.result) : (existing.resultRef as string | undefined),
        };
      }
      // A prior attempt started but never finished: outcome is unknown.
      this.actions.set(id, { ...existing, state: "uncertain" });
      return { id, idempotencyKey: input.idempotencyKey, state: "uncertain", replayVerdict: "reconcile_first" };
    }
    this.actions.set(id, { ...input, id, state: "started", idempotencyKey: input.idempotencyKey } as unknown as ActionRegistration & Record<string, unknown>);
    return { id, idempotencyKey: input.idempotencyKey, state: "new", replayVerdict: "safe_to_execute" };
  }

  async markStarted(input: Parameters<ReviveTransport["markStarted"]>[0]): Promise<void> {
    const current = this.actions.get(input.actionId);
    if (current) this.actions.set(input.actionId, { ...current, state: "started" } as unknown as ActionRegistration & Record<string, unknown>);
  }

  async completeAction(input: Parameters<ReviveTransport["completeAction"]>[0]): Promise<void> {
    const current = this.actions.get(input.actionId) || {
      id: input.actionId,
      idempotencyKey: input.idempotencyKey,
    };
    this.actions.set(input.actionId, {
      ...current,
      state: "completed",
      result: input.result,
    });
  }

  async markReconciled(input: Parameters<ReviveTransport["markReconciled"]>[0]): Promise<void> {
    const current = this.actions.get(input.actionId) || {
      id: input.actionId,
      idempotencyKey: input.idempotencyKey,
    };
    this.actions.set(input.actionId, {
      ...current,
      state: "reconciled",
      remoteId: input.remoteId,
      note: input.note,
    });
  }

  async openRecoveryCase(input: Parameters<ReviveTransport["openRecoveryCase"]>[0]): Promise<RecoveryCase> {
    const id = `rcv_${hash(`${input.runId}:${input.actionKey}:${input.idempotencyKey}:${input.reason}`)}`;
    const recoveryCase: RecoveryCase = {
      id,
      runId: input.runId,
      checkpointId: input.checkpointId,
      connectionId: input.connectionId,
      actionKey: input.actionKey,
      idempotencyKey: input.idempotencyKey,
      provider: input.provider,
      policy: input.policy,
      reason: input.reason,
      leaseGeneration: input.leaseGeneration,
      url: `/reauthorize/${encodeURIComponent(id)}`,
    };
    this.recoveryCases.set(id, recoveryCase);
    return recoveryCase;
  }

  async registerTransaction(input: CreateOutcomeTransactionInput): Promise<OutcomeTransaction> {
    const id = `txn_${hash(`${input.contractKey}:${input.idempotencyKey}`)}`;
    const existing = this.transactions.get(id);
    if (existing) return existing;
    const transaction: OutcomeTransaction = {
      id, runId: input.runId, contractKey: input.contractKey, idempotencyKey: input.idempotencyKey,
      title: input.title || input.contractKey.replaceAll("-", " "), state: input.requireApproval ? "awaiting_approval" : "planned", version: 1,
      traceContext: input.traceContext,
      steps: input.steps.map((step) => ({ id: `txs_${hash(`${id}:${step.key}`)}`, key: step.key, actionKey: step.actionKey, connectionId: step.connectionId, actionId: step.actionId, expectedOutcome: step.expectedOutcome, state: "planned", version: 1 })),
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  async transitionTransactionStep(input: Parameters<ReviveTransport["transitionTransactionStep"]>[0]): Promise<OutcomeTransaction> {
    const transaction = this.transactions.get(input.transactionId);
    if (!transaction) throw new Error("transaction not found");
    if (transaction.state === "awaiting_approval" || transaction.state === "cancelled") throw new Error(`transaction is ${transaction.state}`);
    const step = transaction.steps.find((item) => item.key === input.stepKey);
    if (!step) throw new Error("transaction step not found");
    if (step.version !== input.expectedVersion) throw new Error("stale transaction step version");
    step.state = input.to; step.version += 1; step.actionId = input.actionId || step.actionId; step.remoteId = input.remoteId || step.remoteId;
    transaction.version += 1; transaction.state = memoryTransactionState(transaction.steps);
    return transaction;
  }

  async decideTransaction(input: Parameters<ReviveTransport["decideTransaction"]>[0]): Promise<OutcomeTransaction> {
    const transaction = this.transactions.get(input.transactionId);
    if (!transaction) throw new Error("transaction not found");
    if (transaction.state !== "awaiting_approval") throw new Error("transaction is not awaiting approval");
    transaction.state = input.decision === "approve" ? "planned" : "cancelled"; transaction.version += 1;
    return transaction;
  }

  async requestUserAction(input: CreateUserActionRequestInput): Promise<UserActionRequest> {
    const id = `uar_${hash(`${input.runId}:${input.idempotencyKey}`)}`;
    const existing = this.userActionRequests.get(id);
    if (existing) return existing;
    const defaults: Partial<Record<UserActionType, UserActionField[]>> = {
      approval: [{ key: "decision", type: "select", label: "Decision", required: true, options: [{ value: "approve", label: "Approve" }, { value: "reject", label: "Reject" }] }],
      clarification: [{ key: "answer", type: "textarea", label: "Information needed to continue", description: "Provide the specific detail requested by the workflow.", placeholder: "Enter the requested information", required: true }],
      verification: [{ key: "result", type: "select", label: "What happened?", required: true, options: [{ value: "confirmed", label: "It happened" }, { value: "not_happened", label: "It did not happen" }] }],
    };
    const record: UserActionRequest = {
      id, runId: input.runId, checkpointId: input.checkpointId, generation: input.generation ?? 1,
      actionType: input.actionType, idempotencyKey: input.idempotencyKey, title: input.title, status: "pending",
      recipient: input.recipient, fields: input.fields || defaults[input.actionType] || [],
      expiresAt: Date.now() + 48 * 60 * 60 * 1000, resumeStatus: "not_configured", url: `/actions/${id}`,
    };
    this.userActionRequests.set(id, record);
    return record;
  }

  async getUserAction(id: string): Promise<UserActionRequest> {
    const request = this.userActionRequests.get(id);
    if (!request) throw new Error("action request not found");
    return request;
  }

  async cancelUserAction(id: string): Promise<UserActionRequest> {
    const request = await this.getUserAction(id);
    if (request.status === "pending") request.status = "cancelled";
    return request;
  }

  async recordDeadRun(input: RecordDeadRunInput): Promise<DeadRunRecord> {
    const id = `dr_${hash(`${input.runId}:${input.idempotencyKey}`)}`;
    const existing = this.deadRuns.get(id); if (existing) return existing;
    const text = `${input.failureMessage} ${JSON.stringify(input.trace || {})}`.toLowerCase();
    const category: DeadRunCategory = /(invalid_grant|oauth|token expired|revoked|401)/.test(text) ? "expired_oauth"
      : /(approval|required approval|budget limit)/.test(text) ? "approval_needed"
        : /(missing input|required field|clarif)/.test(text) ? "missing_input"
          : /(403|permission|scope)/.test(text) ? "permission_denied"
            : /(captcha|otp|passkey|browser session)/.test(text) ? "browser_intervention" : "unknown";
    const action: Record<DeadRunCategory, UserActionType> = { expired_oauth: "reauthorization", missing_input: "clarification", approval_needed: "approval", permission_denied: "permission", browser_intervention: "browser_handoff", ambiguous_side_effect: "verification", unknown: "clarification" };
    const record: DeadRunRecord = { id, runId: input.runId, checkpointId: input.checkpointId, generation: input.generation ?? 1, runtime: input.runtime || "custom", category, confidence: category === "unknown" ? .35 : .88, recoverable: category !== "unknown", suggestedActionType: action[category], suggestedRecipientRole: category === "expired_oauth" ? "account owner" : "run owner", suggestedQuestion: category === "expired_oauth" ? "Reconnect this account so the agent can continue." : "Provide the action needed to continue.", inputTokens: input.inputTokens || 0, outputTokens: input.outputTokens || 0, estimatedCostUsd: input.estimatedCostUsd || 0, status: "detected" };
    this.deadRuns.set(id, record); return record;
  }

  async getDeadRunStats(days = 7): Promise<DeadRunStats> {
    const runs = [...this.deadRuns.values()]; const total = runs.length; const recoverable = runs.filter((run) => run.recoverable).length;
    const counts = new Map<DeadRunCategory, number>(); for (const run of runs) counts.set(run.category, (counts.get(run.category) || 0) + 1);
    return { days, totalRunsLost: total, recoverableRuns: recoverable, recoverableRate: total ? recoverable / total : 0, wastedTokens: runs.reduce((sum, run) => sum + run.inputTokens + run.outputTokens, 0), estimatedCostUsd: runs.reduce((sum, run) => sum + run.estimatedCostUsd, 0), resolvedRuns: runs.filter((run) => run.status === "resolved").length, categories: [...counts].map(([category, count]) => ({ category, count, share: total ? count / total : 0 })) };
  }

  async resolveDeadRun(input: Parameters<ReviveTransport["resolveDeadRun"]>[0]): Promise<{ deadRun: DeadRunRecord; request: UserActionRequest }> {
    const deadRun = this.deadRuns.get(input.deadRunId); if (!deadRun) throw new Error("dead run not found");
    const request = await this.requestUserAction({ runId: deadRun.runId, checkpointId: deadRun.checkpointId, generation: deadRun.generation, idempotencyKey: `dead-run:${deadRun.id}`, actionType: deadRun.suggestedActionType, title: deadRun.suggestedQuestion, recipient: input.recipient, destinationUrl: input.destinationUrl, expiresIn: input.expiresIn });
    deadRun.status = "resolution_requested"; deadRun.actionRequestId = request.id; return { deadRun, request };
  }
}

export type ReviveResumeEventType =
  | "recovery.resume_test"
  | "recovery.resume_requested"
  | "action_request.completed";

export interface ReviveResumeEvent {
  id: string;
  type: ReviveResumeEventType | string;
  createdAt: string;
  data: Record<string, unknown>;
}

export interface ResumeAcknowledgement extends Record<string, unknown> {
  ok: true;
  resumed: true;
  runId: string;
  checkpointId?: string;
  generation: number;
}

export interface ResumeReceiptStore {
  get(webhookId: string): ResumeAcknowledgement | undefined | Promise<ResumeAcknowledgement | undefined>;
  put(webhookId: string, acknowledgement: ResumeAcknowledgement): void | Promise<void>;
}

/** Process-local retry receipts. Use a durable implementation in production so
 * a successful acknowledgement survives a runtime restart. */
export class MemoryResumeReceiptStore implements ResumeReceiptStore {
  private receipts = new Map<string, ResumeAcknowledgement>();

  get(webhookId: string): ResumeAcknowledgement | undefined {
    const receipt = this.receipts.get(webhookId);
    return receipt ? { ...receipt } : undefined;
  }

  put(webhookId: string, acknowledgement: ResumeAcknowledgement): void {
    this.receipts.set(webhookId, { ...acknowledgement });
  }
}

export interface VerifyReviveWebhookSignatureInput {
  secret: string;
  signature: string;
  webhookId: string;
  timestamp: string;
  rawBody: string | Uint8Array;
  toleranceSeconds?: number;
  now?: number;
}

/** Verify the exact request bytes before parsing JSON. */
export function verifyReviveWebhookSignature(input: VerifyReviveWebhookSignatureInput): boolean {
  const seconds = Number(input.timestamp);
  const now = input.now ?? Date.now() / 1000;
  if (!Number.isFinite(seconds) || Math.abs(now - seconds) > (input.toleranceSeconds ?? 300)) return false;
  const rawBody = typeof input.rawBody === "string" ? Buffer.from(input.rawBody) : Buffer.from(input.rawBody);
  const expected = `v1,${createHmac("sha256", input.secret)
    .update(Buffer.concat([Buffer.from(`${input.webhookId}.${input.timestamp}.`), rawBody]))
    .digest("hex")}`;
  const receivedBytes = Buffer.from(input.signature || "");
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export interface ResumeWebhookRequest {
  headers: Headers | Record<string, string | string[] | undefined>;
  rawBody: string | Uint8Array;
}

export interface ResumeWebhookResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface CreateResumeWebhookHandlerOptions {
  secret: string;
  /** Return only after the checkpoint has been durably accepted for resume.
   * Throw on failure so Revive retries the same signed event. */
  resume: (
    data: Record<string, unknown>,
    context: { eventId: string; eventType: "recovery.resume_requested" | "action_request.completed" },
  ) => void | Record<string, unknown> | Promise<void | Record<string, unknown>>;
  receipts?: ResumeReceiptStore;
  toleranceSeconds?: number;
}

/** Create the receiver for both credential recovery and completed human-action
 * continuations. The returned handler is framework-neutral and requires the
 * raw request body because signatures cover the exact bytes on the wire. */
export function createResumeWebhookHandler(options: CreateResumeWebhookHandlerOptions) {
  if (!options.secret) throw new Error("REVIVE_RESUME_SECRET is required");
  const receipts = options.receipts ?? new MemoryResumeReceiptStore();
  const inFlight = new Map<string, Promise<ResumeWebhookResponse>>();

  return async (request: ResumeWebhookRequest): Promise<ResumeWebhookResponse> => {
    const webhookId = resumeHeader(request.headers, "webhook-id");
    const timestamp = resumeHeader(request.headers, "webhook-timestamp");
    const signature = resumeHeader(request.headers, "webhook-signature");
    if (!verifyReviveWebhookSignature({
      secret: options.secret,
      signature,
      webhookId,
      timestamp,
      rawBody: request.rawBody,
      toleranceSeconds: options.toleranceSeconds,
    })) {
      return { status: 401, body: { ok: false, error: "invalid signature" } };
    }

    let event: ReviveResumeEvent;
    try {
      const raw = typeof request.rawBody === "string"
        ? request.rawBody
        : new TextDecoder().decode(request.rawBody);
      event = JSON.parse(raw) as ReviveResumeEvent;
    } catch {
      return { status: 400, body: { ok: false, error: "invalid JSON" } };
    }
    if (!event || event.id !== webhookId || typeof event.type !== "string" || !isRecord(event.data)) {
      return { status: 400, body: { ok: false, error: "invalid Revive event" } };
    }
    if (event.type === "recovery.resume_test") {
      return { status: 200, body: { ok: true, test: true } };
    }
    if (event.type !== "recovery.resume_requested" && event.type !== "action_request.completed") {
      return { status: 200, body: { ok: true, ignored: event.type } };
    }
    const eventType = event.type;

    const cached = await receipts.get(webhookId);
    if (cached) return { status: 200, body: cached };
    const existing = inFlight.get(webhookId);
    if (existing) return existing;

    const delivery = (async (): Promise<ResumeWebhookResponse> => {
      const runId = typeof event.data.runId === "string" ? event.data.runId : "";
      const checkpointId = typeof event.data.checkpointId === "string" ? event.data.checkpointId : undefined;
      const generation = typeof event.data.generation === "number" ? event.data.generation : Number.NaN;
      if (!runId || !Number.isFinite(generation)) {
        return { status: 400, body: { ok: false, error: "resume event is missing runId or generation" } };
      }
      try {
        const extra = await options.resume(event.data, {
          eventId: event.id,
          eventType,
        });
        const acknowledgement: ResumeAcknowledgement = {
          ...(extra || {}),
          ok: true,
          resumed: true,
          runId,
          ...(checkpointId ? { checkpointId } : {}),
          generation,
        };
        await receipts.put(webhookId, acknowledgement);
        return { status: 200, body: acknowledgement };
      } catch (error) {
        return {
          status: 500,
          body: { ok: false, error: error instanceof Error ? error.message : String(error) },
        };
      }
    })();
    inFlight.set(webhookId, delivery);
    try {
      return await delivery;
    } finally {
      inFlight.delete(webhookId);
    }
  };
}

function resumeHeader(headers: ResumeWebhookRequest["headers"], name: string): string {
  if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get(name) || "";
  const record = headers as Record<string, string | string[] | undefined>;
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name);
  const value = key ? record[key] : undefined;
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export interface InterruptFailure {
  runId: string; checkpointId?: string; generation?: number; failureMessage: string; trace?: unknown;
  inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number; idempotencyKey?: string;
}

function interruptAdapter(client: ReviveClient, runtime: string) {
  return (failure: InterruptFailure) => client.detectDeadRun({
    ...failure, runtime,
    idempotencyKey: failure.idempotencyKey || createIdempotencyKey(failure.runId, `dead-run:${runtime}`, failure.checkpointId),
  });
}

/** Point existing interrupt/failure hook at one of these adapters. */
export const createLangGraphInterruptHandler = (client: ReviveClient) => interruptAdapter(client, "langgraph");
export const createTemporalFailureSignal = (client: ReviveClient) => interruptAdapter(client, "temporal");
export const createMcpElicitationHandler = (client: ReviveClient) => interruptAdapter(client, "mcp");

function memoryTransactionState(steps: OutcomeTransactionStep[]): OutcomeTransactionState {
  if (steps.some((step) => step.state === "failed")) return "needs_human";
  if (steps.some((step) => step.state === "unknown" || step.state === "compensating")) return "recovering";
  if (steps.every((step) => ["verified", "compensated", "skipped"].includes(step.state))) return steps.some((step) => step.state === "compensated") ? "compensated" : "verified";
  if (steps.some((step) => step.state === "succeeded" || step.state === "verifying")) return "verifying";
  if (steps.some((step) => step.state === "executing")) return "executing";
  return "planned";
}

export function createIdempotencyKey(runId: string, actionKey: string, checkpointId = "checkpoint"): string {
  // Deterministic SHA-256 over the action coordinates. 32-bit hashes collide
  // at real workloads; a collision here means a skipped side effect.
  const digest = createHash("sha256").update(`${runId}:${checkpointId}:${actionKey}`).digest("base64url");
  return `revive_${digest.slice(0, 43)}`;
}

/** Derive only policy facts from a local tool call. The caller keeps the input. */
export function inferActionRisk(actionKey: string, input?: unknown): ActionRiskContext {
  const key = actionKey.toLowerCase();
  const outbound = /(send|email|mail|message|invite|notify|post|publish)/.test(key);
  const monetary = /(payment|charge|refund|transfer|invoice|payout|purchase)/.test(key);
  const destructive = /(delete|remove|archive|revoke|cancel|terminate|purge|wipe)/.test(key);
  const production = /(deploy|release|publish)/.test(key) && /(?:production|prod)/.test(safeString(input));
  const recipientCount = outbound ? countRecipients(input) : 0;
  const operation = monetary ? "money_movement" : destructive ? "destructive_change" : production ? "production_change" : outbound ? "outbound_message" : "unknown";
  return {
    operation,
    ...(recipientCount ? { recipientCount } : {}),
    ...(monetary ? { monetary: true } : {}),
    ...(destructive ? { destructive: true } : {}),
    ...(production ? { production: true } : {}),
  };
}

export function defaultCredentialFailureClassifier(error: unknown): CredentialFailure | null {
  if (!isRecord(error)) return null;
  const status = typeof error.status === "number" ? error.status : undefined;
  const code = typeof error.code === "string" ? error.code : typeof error.error === "string" ? error.error : undefined;
  const message = typeof error.message === "string" ? error.message : "";
  const lower = `${code || ""} ${message}`.toLowerCase();

  if (
    status === 401 ||
    lower.includes("invalid_grant") ||
    lower.includes("aadsts") ||
    lower.includes("token expired") ||
    lower.includes("revoked")
  ) {
    return {
      code,
      reason: message || "Credential rejected by provider",
      policy: "interactive_reauth",
    };
  }
  return null;
}

function classifyWith<TCredential, TResult>(
  input: ProtectActionInput<TCredential, TResult>,
  error: unknown,
): CredentialFailure | null {
  return input.classifyError?.(error) || defaultCredentialFailureClassifier(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseResultRef<T>(resultRef?: string): T {
  if (resultRef === undefined) return undefined as T;
  try {
    return JSON.parse(resultRef) as T;
  } catch {
    return resultRef as T;
  }
}

function hash(value: string): string {
  let state = 2166136261;
  for (let index = 0; index < value.length; index++) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return (state >>> 0).toString(36).padStart(7, "0");
}

function safeString(value: unknown): string {
  try {
    return JSON.stringify(value || {}).toLowerCase();
  } catch {
    return "";
  }
}

function countRecipients(value: unknown, depth = 0): number {
  if (depth > 3 || value === null || value === undefined) return 0;
  if (typeof value === "string") return value.split(",").map((part) => part.trim()).filter(Boolean).length || 1;
  if (Array.isArray(value)) return value.reduce((total, item) => total + countRecipients(item, depth + 1), 0);
  if (!isRecord(value)) return 0;
  if (Object.keys(value).some((key) => /^(address|email|emailaddress|id)$/i.test(key))) return 1;
  return Math.min(100_000, Object.entries(value).reduce((total, [key, nested]) => {
    if (/^(to|cc|bcc|recipient|recipients|emailAddresses|users|invitees)$/i.test(key)) return total + countRecipients(nested, depth + 1);
    return total;
  }, 0));
}
