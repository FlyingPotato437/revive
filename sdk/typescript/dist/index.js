import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export class ReviveClient {
    transport;
    constructor(options = {}) {
        if (options.transport) {
            this.transport = options.transport;
        }
        else if (options.baseUrl) {
            this.transport = new HttpReviveTransport({ baseUrl: options.baseUrl, apiKey: options.apiKey });
        }
        else {
            this.transport = new MemoryReviveTransport();
        }
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
            reconcileHints: input.reconcileHints,
            riskContext: input.riskContext,
        });
        // Ledger verdict gate: never execute an action the control plane already
        // knows the outcome of. Only "new" may run the side effect.
        if (action.state === "completed" || action.state === "reconciled") {
            return {
                status: "completed",
                value: parseResultRef(action.resultRef),
                idempotencyKey,
                actionId: action.id,
                recoveredFromReconcile: action.state === "reconciled",
                deduplicated: true,
            };
        }
        if (action.state === "uncertain") {
            // A previous attempt may have committed remotely. Reconcile before any replay.
            if (!input.reconcile)
                throw new AmbiguousCommitError();
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
            // Confirmed not committed upstream: safe to execute below.
        }
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
        // Recorded immediately before the side effect. Everything up to here
        // (registration, credential acquisition, parking) leaves the action
        // "prepared", so those failures replay as safe "new" — not as an
        // ambiguous commit.
        await this.transport.markStarted({ actionId: action.id, idempotencyKey });
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
    /** Register one task-scoped operation spanning multiple protected actions. */
    createTransaction(input) {
        return this.transport.registerTransaction(input);
    }
    /** Advance a transaction step only after the runtime has concrete execution
     * or provider-verification evidence for that state change. */
    transitionTransactionStep(input) {
        return this.transport.transitionTransactionStep(input);
    }
    decideTransaction(input) {
        return this.transport.decideTransaction(input);
    }
    /** Ask a specific person to unblock a suspended run. Revive returns a
     * single-use action URL and later emits a signed continuation event. */
    requestAction(input) {
        return this.transport.requestUserAction(input);
    }
    getActionRequest(id) {
        return this.transport.getUserAction(id);
    }
    cancelActionRequest(id) {
        return this.transport.cancelUserAction(id);
    }
    /** Record one run that terminated at a human-dependent boundary. Trace is
     * redacted server-side before classification or storage. */
    detectDeadRun(input) {
        return this.transport.recordDeadRun(input);
    }
    deadRunStats(days = 7) {
        return this.transport.getDeadRunStats(days);
    }
    reviveDeadRun(input) {
        return this.transport.resolveDeadRun(input);
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
    markStarted(input) {
        return this.request(`/v1/actions/${encodeURIComponent(input.actionId)}/started`, input);
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
    async registerTransaction(input) {
        const response = await this.request("/v1/transactions", input);
        return response.transaction;
    }
    async transitionTransactionStep(input) {
        const response = await this.request(`/v1/transactions/${encodeURIComponent(input.transactionId)}/steps/${encodeURIComponent(input.stepKey)}`, input);
        return response.transaction;
    }
    async decideTransaction(input) {
        const response = await this.request(`/v1/transactions/${encodeURIComponent(input.transactionId)}/approval`, input);
        return response.transaction;
    }
    async requestUserAction(input) {
        const response = await this.request("/v1/action-requests", input);
        return response.request;
    }
    async getUserAction(id) {
        const response = await this.fetchJson(`/v1/action-requests/${encodeURIComponent(id)}`, { method: "GET" });
        return response.request;
    }
    async cancelUserAction(id) {
        const response = await this.fetchJson(`/v1/action-requests/${encodeURIComponent(id)}`, { method: "DELETE" });
        return response.request;
    }
    async recordDeadRun(input) {
        const response = await this.request("/v1/dead-runs", input);
        return response.run;
    }
    async getDeadRunStats(days = 7) {
        const response = await this.fetchJson(`/v1/dead-runs/stats?days=${Math.max(1, Math.floor(days))}`, { method: "GET" });
        return response.stats;
    }
    async resolveDeadRun(input) {
        const { deadRunId, ...body } = input;
        return this.request(`/v1/dead-runs/${encodeURIComponent(deadRunId)}/revive`, body);
    }
    async request(path, body) {
        return this.fetchJson(path, {
            method: "POST",
            body: JSON.stringify(body),
        });
    }
    async fetchJson(path, init) {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            ...init,
            headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
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
    transactions = new Map();
    userActionRequests = new Map();
    deadRuns = new Map();
    async registerAction(input) {
        const id = `act_${hash(`${input.runId}:${input.actionKey}:${input.idempotencyKey}`)}`;
        const existing = this.actions.get(id);
        if (existing) {
            const previous = existing.state;
            if (previous === "completed" || previous === "reconciled") {
                return {
                    id, idempotencyKey: input.idempotencyKey, state: previous, replayVerdict: "already_committed",
                    resultRef: existing.result !== undefined ? JSON.stringify(existing.result) : existing.resultRef,
                };
            }
            // A prior attempt started but never finished: outcome is unknown.
            this.actions.set(id, { ...existing, state: "uncertain" });
            return { id, idempotencyKey: input.idempotencyKey, state: "uncertain", replayVerdict: "reconcile_first" };
        }
        this.actions.set(id, { ...input, id, state: "started", idempotencyKey: input.idempotencyKey });
        return { id, idempotencyKey: input.idempotencyKey, state: "new", replayVerdict: "safe_to_execute" };
    }
    async markStarted(input) {
        const current = this.actions.get(input.actionId);
        if (current)
            this.actions.set(input.actionId, { ...current, state: "started" });
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
    async registerTransaction(input) {
        const id = `txn_${hash(`${input.contractKey}:${input.idempotencyKey}`)}`;
        const existing = this.transactions.get(id);
        if (existing)
            return existing;
        const transaction = {
            id, runId: input.runId, contractKey: input.contractKey, idempotencyKey: input.idempotencyKey,
            title: input.title || input.contractKey.replaceAll("-", " "), state: input.requireApproval ? "awaiting_approval" : "planned", version: 1,
            traceContext: input.traceContext,
            steps: input.steps.map((step) => ({ id: `txs_${hash(`${id}:${step.key}`)}`, key: step.key, actionKey: step.actionKey, connectionId: step.connectionId, actionId: step.actionId, expectedOutcome: step.expectedOutcome, state: "planned", version: 1 })),
        };
        this.transactions.set(id, transaction);
        return transaction;
    }
    async transitionTransactionStep(input) {
        const transaction = this.transactions.get(input.transactionId);
        if (!transaction)
            throw new Error("transaction not found");
        if (transaction.state === "awaiting_approval" || transaction.state === "cancelled")
            throw new Error(`transaction is ${transaction.state}`);
        const step = transaction.steps.find((item) => item.key === input.stepKey);
        if (!step)
            throw new Error("transaction step not found");
        if (step.version !== input.expectedVersion)
            throw new Error("stale transaction step version");
        step.state = input.to;
        step.version += 1;
        step.actionId = input.actionId || step.actionId;
        step.remoteId = input.remoteId || step.remoteId;
        transaction.version += 1;
        transaction.state = memoryTransactionState(transaction.steps);
        return transaction;
    }
    async decideTransaction(input) {
        const transaction = this.transactions.get(input.transactionId);
        if (!transaction)
            throw new Error("transaction not found");
        if (transaction.state !== "awaiting_approval")
            throw new Error("transaction is not awaiting approval");
        transaction.state = input.decision === "approve" ? "planned" : "cancelled";
        transaction.version += 1;
        return transaction;
    }
    async requestUserAction(input) {
        const id = `uar_${hash(`${input.runId}:${input.idempotencyKey}`)}`;
        const existing = this.userActionRequests.get(id);
        if (existing)
            return existing;
        const defaults = {
            approval: [{ key: "decision", type: "select", label: "Decision", required: true, options: [{ value: "approve", label: "Approve" }, { value: "reject", label: "Reject" }] }],
            clarification: [{ key: "answer", type: "textarea", label: "Information needed to continue", description: "Provide the specific detail requested by the workflow.", placeholder: "Enter the requested information", required: true }],
            verification: [{ key: "result", type: "select", label: "What happened?", required: true, options: [{ value: "confirmed", label: "It happened" }, { value: "not_happened", label: "It did not happen" }] }],
        };
        const record = {
            id, runId: input.runId, checkpointId: input.checkpointId, generation: input.generation ?? 1,
            actionType: input.actionType, idempotencyKey: input.idempotencyKey, title: input.title, status: "pending",
            recipient: input.recipient, fields: input.fields || defaults[input.actionType] || [],
            expiresAt: Date.now() + 48 * 60 * 60 * 1000, resumeStatus: "not_configured", url: `/actions/${id}`,
        };
        this.userActionRequests.set(id, record);
        return record;
    }
    async getUserAction(id) {
        const request = this.userActionRequests.get(id);
        if (!request)
            throw new Error("action request not found");
        return request;
    }
    async cancelUserAction(id) {
        const request = await this.getUserAction(id);
        if (request.status === "pending")
            request.status = "cancelled";
        return request;
    }
    async recordDeadRun(input) {
        const id = `dr_${hash(`${input.runId}:${input.idempotencyKey}`)}`;
        const existing = this.deadRuns.get(id);
        if (existing)
            return existing;
        const text = `${input.failureMessage} ${JSON.stringify(input.trace || {})}`.toLowerCase();
        const category = /(invalid_grant|oauth|token expired|revoked|401)/.test(text) ? "expired_oauth"
            : /(approval|required approval|budget limit)/.test(text) ? "approval_needed"
                : /(missing input|required field|clarif)/.test(text) ? "missing_input"
                    : /(403|permission|scope)/.test(text) ? "permission_denied"
                        : /(captcha|otp|passkey|browser session)/.test(text) ? "browser_intervention" : "unknown";
        const action = { expired_oauth: "reauthorization", missing_input: "clarification", approval_needed: "approval", permission_denied: "permission", browser_intervention: "browser_handoff", ambiguous_side_effect: "verification", unknown: "clarification" };
        const record = { id, runId: input.runId, checkpointId: input.checkpointId, generation: input.generation ?? 1, runtime: input.runtime || "custom", category, confidence: category === "unknown" ? .35 : .88, recoverable: category !== "unknown", suggestedActionType: action[category], suggestedRecipientRole: category === "expired_oauth" ? "account owner" : "run owner", suggestedQuestion: category === "expired_oauth" ? "Reconnect this account so the agent can continue." : "Provide the action needed to continue.", inputTokens: input.inputTokens || 0, outputTokens: input.outputTokens || 0, estimatedCostUsd: input.estimatedCostUsd || 0, status: "detected" };
        this.deadRuns.set(id, record);
        return record;
    }
    async getDeadRunStats(days = 7) {
        const runs = [...this.deadRuns.values()];
        const total = runs.length;
        const recoverable = runs.filter((run) => run.recoverable).length;
        const counts = new Map();
        for (const run of runs)
            counts.set(run.category, (counts.get(run.category) || 0) + 1);
        return { days, totalRunsLost: total, recoverableRuns: recoverable, recoverableRate: total ? recoverable / total : 0, wastedTokens: runs.reduce((sum, run) => sum + run.inputTokens + run.outputTokens, 0), estimatedCostUsd: runs.reduce((sum, run) => sum + run.estimatedCostUsd, 0), resolvedRuns: runs.filter((run) => run.status === "resolved").length, categories: [...counts].map(([category, count]) => ({ category, count, share: total ? count / total : 0 })) };
    }
    async resolveDeadRun(input) {
        const deadRun = this.deadRuns.get(input.deadRunId);
        if (!deadRun)
            throw new Error("dead run not found");
        const request = await this.requestUserAction({ runId: deadRun.runId, checkpointId: deadRun.checkpointId, generation: deadRun.generation, idempotencyKey: `dead-run:${deadRun.id}`, actionType: deadRun.suggestedActionType, title: deadRun.suggestedQuestion, recipient: input.recipient, destinationUrl: input.destinationUrl, expiresIn: input.expiresIn });
        deadRun.status = "resolution_requested";
        deadRun.actionRequestId = request.id;
        return { deadRun, request };
    }
}
/** Process-local retry receipts. Use a durable implementation in production so
 * a successful acknowledgement survives a runtime restart. */
export class MemoryResumeReceiptStore {
    receipts = new Map();
    get(webhookId) {
        const receipt = this.receipts.get(webhookId);
        return receipt ? { ...receipt } : undefined;
    }
    put(webhookId, acknowledgement) {
        this.receipts.set(webhookId, { ...acknowledgement });
    }
}
/** Verify the exact request bytes before parsing JSON. */
export function verifyReviveWebhookSignature(input) {
    const seconds = Number(input.timestamp);
    const now = input.now ?? Date.now() / 1000;
    if (!Number.isFinite(seconds) || Math.abs(now - seconds) > (input.toleranceSeconds ?? 300))
        return false;
    const rawBody = typeof input.rawBody === "string" ? Buffer.from(input.rawBody) : Buffer.from(input.rawBody);
    const expected = `v1,${createHmac("sha256", input.secret)
        .update(Buffer.concat([Buffer.from(`${input.webhookId}.${input.timestamp}.`), rawBody]))
        .digest("hex")}`;
    const receivedBytes = Buffer.from(input.signature || "");
    const expectedBytes = Buffer.from(expected);
    return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
/** Create the receiver for both credential recovery and completed human-action
 * continuations. The returned handler is framework-neutral and requires the
 * raw request body because signatures cover the exact bytes on the wire. */
export function createResumeWebhookHandler(options) {
    if (!options.secret)
        throw new Error("REVIVE_RESUME_SECRET is required");
    const receipts = options.receipts ?? new MemoryResumeReceiptStore();
    const inFlight = new Map();
    return async (request) => {
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
        let event;
        try {
            const raw = typeof request.rawBody === "string"
                ? request.rawBody
                : new TextDecoder().decode(request.rawBody);
            event = JSON.parse(raw);
        }
        catch {
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
        if (cached)
            return { status: 200, body: cached };
        const existing = inFlight.get(webhookId);
        if (existing)
            return existing;
        const delivery = (async () => {
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
                const acknowledgement = {
                    ...(extra || {}),
                    ok: true,
                    resumed: true,
                    runId,
                    ...(checkpointId ? { checkpointId } : {}),
                    generation,
                };
                await receipts.put(webhookId, acknowledgement);
                return { status: 200, body: acknowledgement };
            }
            catch (error) {
                return {
                    status: 500,
                    body: { ok: false, error: error instanceof Error ? error.message : String(error) },
                };
            }
        })();
        inFlight.set(webhookId, delivery);
        try {
            return await delivery;
        }
        finally {
            inFlight.delete(webhookId);
        }
    };
}
function resumeHeader(headers, name) {
    if (typeof Headers !== "undefined" && headers instanceof Headers)
        return headers.get(name) || "";
    const record = headers;
    const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name);
    const value = key ? record[key] : undefined;
    return Array.isArray(value) ? value[0] || "" : value || "";
}
function interruptAdapter(client, runtime) {
    return (failure) => client.detectDeadRun({
        ...failure, runtime,
        idempotencyKey: failure.idempotencyKey || createIdempotencyKey(failure.runId, `dead-run:${runtime}`, failure.checkpointId),
    });
}
/** Point existing interrupt/failure hook at one of these adapters. */
export const createLangGraphInterruptHandler = (client) => interruptAdapter(client, "langgraph");
export const createTemporalFailureSignal = (client) => interruptAdapter(client, "temporal");
export const createMcpElicitationHandler = (client) => interruptAdapter(client, "mcp");
function memoryTransactionState(steps) {
    if (steps.some((step) => step.state === "failed"))
        return "needs_human";
    if (steps.some((step) => step.state === "unknown" || step.state === "compensating"))
        return "recovering";
    if (steps.every((step) => ["verified", "compensated", "skipped"].includes(step.state)))
        return steps.some((step) => step.state === "compensated") ? "compensated" : "verified";
    if (steps.some((step) => step.state === "succeeded" || step.state === "verifying"))
        return "verifying";
    if (steps.some((step) => step.state === "executing"))
        return "executing";
    return "planned";
}
export function createIdempotencyKey(runId, actionKey, checkpointId = "checkpoint") {
    // Deterministic SHA-256 over the action coordinates. 32-bit hashes collide
    // at real workloads; a collision here means a skipped side effect.
    const digest = createHash("sha256").update(`${runId}:${checkpointId}:${actionKey}`).digest("base64url");
    return `revive_${digest.slice(0, 43)}`;
}
/** Derive only policy facts from a local tool call. The caller keeps the input. */
export function inferActionRisk(actionKey, input) {
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
function parseResultRef(resultRef) {
    if (resultRef === undefined)
        return undefined;
    try {
        return JSON.parse(resultRef);
    }
    catch {
        return resultRef;
    }
}
function hash(value) {
    let state = 2166136261;
    for (let index = 0; index < value.length; index++) {
        state ^= value.charCodeAt(index);
        state = Math.imul(state, 16777619);
    }
    return (state >>> 0).toString(36).padStart(7, "0");
}
function safeString(value) {
    try {
        return JSON.stringify(value || {}).toLowerCase();
    }
    catch {
        return "";
    }
}
function countRecipients(value, depth = 0) {
    if (depth > 3 || value === null || value === undefined)
        return 0;
    if (typeof value === "string")
        return value.split(",").map((part) => part.trim()).filter(Boolean).length || 1;
    if (Array.isArray(value))
        return value.reduce((total, item) => total + countRecipients(item, depth + 1), 0);
    if (!isRecord(value))
        return 0;
    if (Object.keys(value).some((key) => /^(address|email|emailaddress|id)$/i.test(key)))
        return 1;
    return Math.min(100_000, Object.entries(value).reduce((total, [key, nested]) => {
        if (/^(to|cc|bcc|recipient|recipients|emailAddresses|users|invitees)$/i.test(key))
            return total + countRecipients(nested, depth + 1);
        return total;
    }, 0));
}
//# sourceMappingURL=index.js.map