export class ReviveClient {
    transport;
    constructor(options = {}) {
        this.transport = options.transport || new MemoryReviveTransport();
    }
    async protectAction(input) {
        const idempotencyKey = input.idempotencyKey || createIdempotencyKey(input.runId, input.actionKey, input.checkpointId);
        const action = await this.transport.registerAction({
            runId: input.runId,
            checkpointId: input.checkpointId,
            connectionId: input.connectionId,
            actionKey: input.actionKey,
            idempotencyKey,
            metadata: input.metadata,
        });
        let lease;
        try {
            lease = await input.credential();
        }
        catch (error) {
            const failure = classifyWith(input, error);
            if (!failure)
                throw error;
            return this.park(input, action, idempotencyKey, failure);
        }
        const context = {
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
        }
        catch (error) {
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
                        value: reconciled.value,
                        idempotencyKey,
                        actionId: action.id,
                        recoveredFromReconcile: true,
                    };
                }
            }
            const failure = classifyWith(input, error);
            if (!failure)
                throw error;
            return this.park(input, action, idempotencyKey, {
                ...failure,
                provider: failure.provider || lease.provider,
            }, lease.generation);
        }
    }
    async park(input, action, idempotencyKey, failure, leaseGeneration) {
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
export class HttpReviveTransport {
    baseUrl;
    apiKey;
    fetchImpl;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.apiKey = options.apiKey;
        this.fetchImpl = options.fetch || fetch;
    }
    registerAction(input) {
        return this.request("/v1/actions", input);
    }
    completeAction(input) {
        return this.request(`/v1/actions/${encodeURIComponent(input.actionId)}/complete`, input);
    }
    markReconciled(input) {
        return this.request(`/v1/actions/${encodeURIComponent(input.actionId)}/reconciled`, input);
    }
    openRecoveryCase(input) {
        return this.request("/v1/recovery-cases", input);
    }
    async request(path, body) {
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
        if (response.status === 204)
            return undefined;
        return response.json();
    }
}
export class MemoryReviveTransport {
    actions = new Map();
    recoveryCases = new Map();
    async registerAction(input) {
        const id = `act_${hash(`${input.runId}:${input.actionKey}:${input.idempotencyKey}`)}`;
        const action = { ...input, id };
        this.actions.set(id, action);
        return { id, idempotencyKey: input.idempotencyKey };
    }
    async completeAction(input) {
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
    async markReconciled(input) {
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
    async openRecoveryCase(input) {
        const id = `rcv_${hash(`${input.runId}:${input.actionKey}:${input.idempotencyKey}:${input.reason}`)}`;
        const recoveryCase = {
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
export function createIdempotencyKey(runId, actionKey, checkpointId = "checkpoint") {
    return `revive_${hash(`${runId}:${checkpointId}:${actionKey}`)}`;
}
export function defaultCredentialFailureClassifier(error) {
    if (!isRecord(error))
        return null;
    const status = typeof error.status === "number" ? error.status : undefined;
    const code = typeof error.code === "string" ? error.code : typeof error.error === "string" ? error.error : undefined;
    const message = typeof error.message === "string" ? error.message : "";
    const lower = `${code || ""} ${message}`.toLowerCase();
    if (status === 401 ||
        lower.includes("invalid_grant") ||
        lower.includes("aadsts") ||
        lower.includes("token expired") ||
        lower.includes("revoked")) {
        return {
            code,
            reason: message || "Credential rejected by provider",
            policy: "interactive_reauth",
        };
    }
    return null;
}
function classifyWith(input, error) {
    return input.classifyError?.(error) || defaultCredentialFailureClassifier(error);
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function hash(value) {
    let state = 2166136261;
    for (let index = 0; index < value.length; index++) {
        state ^= value.charCodeAt(index);
        state = Math.imul(state, 16777619);
    }
    return (state >>> 0).toString(36).padStart(7, "0");
}
//# sourceMappingURL=index.js.map