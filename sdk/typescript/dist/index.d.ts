export type RecoveryPolicy = "interactive_reauth" | "step_up" | "retry" | "manual_reconcile";
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
export type ReplayVerdict = "safe_to_execute" | "already_committed" | "reconcile_first" | "blocked_stale_generation";
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
export type ProtectActionResult<TResult> = {
    status: "completed";
    value: TResult;
    idempotencyKey: string;
    actionId: string;
    recoveredFromReconcile?: boolean;
    /** True when the ledger already held the outcome and execute() was skipped. */
    deduplicated?: boolean;
} | {
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
    markStarted(input: {
        actionId: string;
        idempotencyKey: string;
    }): Promise<void>;
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
    /** Hosted control-plane base URL, e.g. https://console.revive.dev */
    baseUrl?: string;
    /** Workspace API key (rv_live_…). With baseUrl, selects the HTTP transport. */
    apiKey?: string;
}
export declare class ReviveClient {
    private transport;
    constructor(options?: ReviveClientOptions);
    protectAction<TCredential, TResult>(input: ProtectActionInput<TCredential, TResult>): Promise<ProtectActionResult<TResult>>;
    private park;
}
export declare class AmbiguousCommitError extends Error {
    constructor(message?: string);
}
export interface HttpReviveTransportOptions {
    baseUrl: string;
    apiKey?: string;
    fetch?: typeof fetch;
}
export declare class HttpReviveTransport implements ReviveTransport {
    private baseUrl;
    private apiKey?;
    private fetchImpl;
    constructor(options: HttpReviveTransportOptions);
    registerAction(input: Parameters<ReviveTransport["registerAction"]>[0]): Promise<ActionRegistration>;
    markStarted(input: Parameters<ReviveTransport["markStarted"]>[0]): Promise<void>;
    completeAction(input: Parameters<ReviveTransport["completeAction"]>[0]): Promise<void>;
    markReconciled(input: Parameters<ReviveTransport["markReconciled"]>[0]): Promise<void>;
    openRecoveryCase(input: Parameters<ReviveTransport["openRecoveryCase"]>[0]): Promise<RecoveryCase>;
    private request;
}
export declare class MemoryReviveTransport implements ReviveTransport {
    readonly actions: Map<string, ActionRegistration & Record<string, unknown>>;
    readonly recoveryCases: Map<string, RecoveryCase>;
    registerAction(input: Parameters<ReviveTransport["registerAction"]>[0]): Promise<ActionRegistration>;
    markStarted(input: Parameters<ReviveTransport["markStarted"]>[0]): Promise<void>;
    completeAction(input: Parameters<ReviveTransport["completeAction"]>[0]): Promise<void>;
    markReconciled(input: Parameters<ReviveTransport["markReconciled"]>[0]): Promise<void>;
    openRecoveryCase(input: Parameters<ReviveTransport["openRecoveryCase"]>[0]): Promise<RecoveryCase>;
}
export declare function createIdempotencyKey(runId: string, actionKey: string, checkpointId?: string): string;
export declare function defaultCredentialFailureClassifier(error: unknown): CredentialFailure | null;
//# sourceMappingURL=index.d.ts.map