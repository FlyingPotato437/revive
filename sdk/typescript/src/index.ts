import { createHash } from "node:crypto";
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

  private async request<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
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
}

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
