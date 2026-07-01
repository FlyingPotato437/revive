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

export interface ActionRegistration {
  id: string;
  idempotencyKey: string;
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
  }): Promise<ActionRegistration>;
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
}

export interface ReviveClientOptions {
  transport?: ReviveTransport;
}

export class ReviveClient {
  private transport: ReviveTransport;

  constructor(options: ReviveClientOptions = {}) {
    this.transport = options.transport || new MemoryReviveTransport();
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
    });

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

  completeAction(input: Parameters<ReviveTransport["completeAction"]>[0]): Promise<void> {
    return this.request(`/v1/actions/${encodeURIComponent(input.actionId)}/complete`, input);
  }

  markReconciled(input: Parameters<ReviveTransport["markReconciled"]>[0]): Promise<void> {
    return this.request(`/v1/actions/${encodeURIComponent(input.actionId)}/reconciled`, input);
  }

  openRecoveryCase(input: Parameters<ReviveTransport["openRecoveryCase"]>[0]): Promise<RecoveryCase> {
    return this.request("/v1/recovery-cases", input);
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

  async registerAction(input: Parameters<ReviveTransport["registerAction"]>[0]): Promise<ActionRegistration> {
    const id = `act_${hash(`${input.runId}:${input.actionKey}:${input.idempotencyKey}`)}`;
    const action = { ...input, id };
    this.actions.set(id, action);
    return { id, idempotencyKey: input.idempotencyKey };
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
}

export function createIdempotencyKey(runId: string, actionKey: string, checkpointId = "checkpoint"): string {
  return `revive_${hash(`${runId}:${checkpointId}:${actionKey}`)}`;
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

function hash(value: string): string {
  let state = 2166136261;
  for (let index = 0; index < value.length; index++) {
    state ^= value.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return (state >>> 0).toString(36).padStart(7, "0");
}
