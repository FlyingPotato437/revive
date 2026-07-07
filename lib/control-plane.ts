import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { hostedDatabaseEnabled, withWorkspaceTransaction } from "./hosted";
import { createRecoveryAccessUrl } from "./recovery-access";

export type CaseState =
  | "detected"
  | "classified"
  | "parked"
  | "awaiting_authorization"
  | "identity_verified"
  | "resumed"
  | "reconciled"
  | "completed"
  | "rejected"
  | "expired"
  | "escalated"
  | "manual_review";

export const TERMINAL_STATES: ReadonlySet<CaseState> = new Set([
  "completed", "rejected", "expired", "escalated", "manual_review",
]);

const EDGES: Record<CaseState, CaseState[]> = {
  detected: ["classified"],
  classified: ["parked"],
  parked: ["awaiting_authorization"],
  awaiting_authorization: ["identity_verified"],
  identity_verified: ["resumed"],
  resumed: ["reconciled", "completed"],
  reconciled: ["completed"],
  completed: [],
  rejected: [],
  expired: [],
  escalated: [],
  manual_review: [],
};

export interface CaseEvent {
  at: number;
  from: CaseState | null;
  to: CaseState;
  note?: string;
  actor: string;
}

export interface ControlCase {
  id: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  checkpointId?: string;
  connectionId: string;
  actionKey: string;
  idempotencyKey: string;
  provider?: string;
  policy: "interactive_reauth" | "step_up" | "retry" | "manual_reconcile";
  reason: string;
  state: CaseState;
  version: number;
  leaseGeneration?: number;
  url?: string;
  events: CaseEvent[];
  openedAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

// prepared: registered, side effect NOT yet attempted (safe to execute).
// started: execute() was about to run; outcome unknown if it never completed.
export type ActionState = "prepared" | "started" | "completed" | "uncertain" | "reconciled";

export interface ControlAction {
  id: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  checkpointId?: string;
  connectionId: string;
  actionKey: string;
  idempotencyKey: string;
  state: ActionState;
  version: number;
  attempts: number;
  remoteId?: string;
  note?: string;
  resultRef?: string;
  /** Reconcile hints (subject / internetMessageId / messageId / provider). */
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export class TransitionError extends Error {
  constructor(message: string, readonly status: number = 409) {
    super(message);
    this.name = "TransitionError";
  }
}

interface PlaneFile {
  cases: ControlCase[];
  actions: ControlAction[];
  leases?: CredentialLeaseRecord[];
}

export interface CredentialLeaseRecord {
  workspaceId: string;
  connectionId: string;
  generation: number;
  updatedAt: number;
}

const directory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
const file = path.join(directory, "control-plane.json");

function readLocal(): PlaneFile {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as PlaneFile;
  } catch {
    return { cases: [], actions: [] };
  }
}

function writeLocal(data: PlaneFile): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

type ActionInput = {
  projectId?: string;
  runId: string;
  checkpointId?: string;
  connectionId: string;
  actionKey: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

type OpenCaseInput = {
  projectId?: string;
  runId: string;
  checkpointId?: string;
  connectionId: string;
  actionKey: string;
  idempotencyKey: string;
  provider?: string;
  reason: string;
  policy?: ControlCase["policy"];
  leaseGeneration?: number;
  actor?: string;
};

type TransitionInput = {
  to: CaseState;
  expectedVersion: number;
  note?: string;
  actor?: string;
};

interface DbAction {
  id: string;
  workspace_id: string;
  project_id: string;
  run_id: string;
  checkpoint_id: string | null;
  connection_id: string;
  action_key: string;
  idempotency_key: string;
  state: ActionState;
  version: number | string;
  attempts: number;
  remote_id: string | null;
  note: string | null;
  result_ref: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface DbCase {
  id: string;
  workspace_id: string;
  project_id: string;
  run_id: string;
  checkpoint_id: string | null;
  connection_id: string;
  action_key: string;
  idempotency_key: string;
  provider: string | null;
  policy: ControlCase["policy"];
  reason: string;
  state: CaseState;
  version: number | string;
  lease_generation: number | null;
  url: string | null;
  events: CaseEvent[];
  opened_at: Date | string;
  updated_at: Date | string;
  resolved_at: Date | string | null;
}

function timestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function mapAction(row: DbAction): ControlAction {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    runId: row.run_id,
    checkpointId: row.checkpoint_id || undefined,
    connectionId: row.connection_id,
    actionKey: row.action_key,
    idempotencyKey: row.idempotency_key,
    state: row.state,
    version: Number(row.version),
    attempts: row.attempts,
    remoteId: row.remote_id || undefined,
    note: row.note || undefined,
    resultRef: row.result_ref || undefined,
    metadata: row.metadata || undefined,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function mapCase(row: DbCase): ControlCase {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    runId: row.run_id,
    checkpointId: row.checkpoint_id || undefined,
    connectionId: row.connection_id,
    actionKey: row.action_key,
    idempotencyKey: row.idempotency_key,
    provider: row.provider || undefined,
    policy: row.policy,
    reason: row.reason,
    state: row.state,
    version: Number(row.version),
    leaseGeneration: row.lease_generation ?? undefined,
    url: row.url || undefined,
    events: Array.isArray(row.events) ? row.events : [],
    openedAt: timestamp(row.opened_at),
    updatedAt: timestamp(row.updated_at),
    resolvedAt: row.resolved_at ? timestamp(row.resolved_at) : undefined,
  };
}

async function selectAction(sql: Sql, workspaceId: string, input: ActionInput, projectId: string): Promise<DbAction | null> {
  const rows = await sql<DbAction[]>`
    select * from revive_actions
    where workspace_id = ${workspaceId}
      and project_id = ${projectId}
      and run_id = ${input.runId}
      and action_key = ${input.actionKey}
      and idempotency_key = ${input.idempotencyKey}
    for update
  `;
  return rows[0] || null;
}

export async function registerAction(workspaceId: string, input: ActionInput): Promise<ControlAction> {
  if (!hostedDatabaseEnabled()) {
    const projectId = input.projectId || "project_default";
    const data = readLocal();
    const existing = data.actions.find(
      (action) => action.workspaceId === workspaceId && (action.projectId || "project_default") === projectId && action.runId === input.runId &&
        action.actionKey === input.actionKey && action.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (existing.connectionId !== input.connectionId) {
        throw new TransitionError("idempotency key was already used with a different connection");
      }
      if (existing.state === "started") existing.state = "uncertain";
      existing.attempts += 1;
      existing.updatedAt = Date.now();
      existing.version += 1;
      writeLocal(data);
      return existing;
    }
    const action: ControlAction = {
      id: id("act"), workspaceId, projectId, runId: input.runId, checkpointId: input.checkpointId,
      connectionId: input.connectionId, actionKey: input.actionKey,
      idempotencyKey: input.idempotencyKey, state: "prepared", version: 1, attempts: 1,
      metadata: input.metadata, createdAt: Date.now(), updatedAt: Date.now(),
    };
    data.actions.push(action);
    writeLocal(data);
    return action;
  }

  return withWorkspaceTransaction(workspaceId, async (sql) => {
    if (!input.projectId) {
      const projects = await sql<{ id: string }[]>`select id from revive_projects where workspace_id = ${workspaceId} order by created_at limit 1`;
      input = { ...input, projectId: projects[0]?.id };
    }
    if (!input.projectId) throw new Error("projectId is required for action registration");
    let existing = await selectAction(sql, workspaceId, input, input.projectId);
    if (!existing) {
      const inserted = await sql<DbAction[]>`
        insert into revive_actions
          (id, workspace_id, project_id, run_id, checkpoint_id, connection_id, action_key, idempotency_key, state, version, attempts, metadata)
        values
          (${id("act")}, ${workspaceId}, ${input.projectId}, ${input.runId}, ${input.checkpointId || null}, ${input.connectionId}, ${input.actionKey}, ${input.idempotencyKey}, 'prepared', 1, 1, ${input.metadata ? sql.json(JSON.parse(JSON.stringify(input.metadata))) : null})
        on conflict (workspace_id, project_id, run_id, action_key, idempotency_key) do nothing
        returning *
      `;
      if (inserted[0]) return mapAction(inserted[0]);
      existing = await selectAction(sql, workspaceId, input, input.projectId);
    }
    if (!existing) throw new Error("action registration conflict could not be resolved");
    if (existing.connection_id !== input.connectionId) {
      throw new TransitionError("idempotency key was already used with a different connection");
    }
    const nextState: ActionState = existing.state === "started" ? "uncertain" : existing.state;
    const rows = await sql<DbAction[]>`
      update revive_actions
      set state = ${nextState}, attempts = attempts + 1, version = version + 1, updated_at = now()
      where id = ${existing.id} and workspace_id = ${workspaceId}
      returning *
    `;
    return mapAction(rows[0]);
  });
}

/**
 * Marks the moment execute() is about to run. prepared → started (and
 * uncertain → started after a reconcile confirmed nothing committed). Without
 * this mark, a replay of a never-executed action would falsely read as an
 * ambiguous commit.
 */
export async function startAction(workspaceId: string, actionId: string, projectId?: string): Promise<ControlAction> {
  if (!hostedDatabaseEnabled()) {
    return mutateActionLocal(workspaceId, actionId, (action) => {
      if (action.state !== "prepared" && action.state !== "uncertain") {
        throw new TransitionError(`cannot start an action in state ${action.state}`);
      }
      action.state = "started";
    }, projectId);
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const current = await sql<DbAction[]>`
      select * from revive_actions where id = ${actionId} and workspace_id = ${workspaceId}
        and (${projectId || null}::text is null or project_id = ${projectId || null}) for update
    `;
    if (!current[0]) throw new TransitionError("action not found", 404);
    if (current[0].state !== "prepared" && current[0].state !== "uncertain") {
      throw new TransitionError(`cannot start an action in state ${current[0].state}`);
    }
    const rows = await sql<DbAction[]>`
      update revive_actions
      set state = 'started', version = version + 1, updated_at = now()
      where id = ${actionId} and workspace_id = ${workspaceId}
      returning *
    `;
    return mapAction(rows[0]);
  });
}

export async function completeAction(workspaceId: string, actionId: string, resultRef?: string, projectId?: string): Promise<ControlAction> {
  if (!hostedDatabaseEnabled()) {
    return mutateActionLocal(workspaceId, actionId, (action) => {
      if (action.state === "reconciled") throw new TransitionError("action already reconciled");
      action.state = "completed";
      if (resultRef) action.resultRef = resultRef.slice(0, 16_000);
    }, projectId);
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const current = await sql<DbAction[]>`
      select * from revive_actions where id = ${actionId} and workspace_id = ${workspaceId}
        and (${projectId || null}::text is null or project_id = ${projectId || null}) for update
    `;
    if (!current[0]) throw new TransitionError("action not found", 404);
    if (current[0].state === "reconciled") throw new TransitionError("action already reconciled");
    const rows = await sql<DbAction[]>`
      update revive_actions
      set state = 'completed', result_ref = ${resultRef?.slice(0, 16_000) || null}, version = version + 1, updated_at = now()
      where id = ${actionId} and workspace_id = ${workspaceId}
      returning *
    `;
    return mapAction(rows[0]);
  });
}

export async function reconcileAction(
  workspaceId: string,
  actionId: string,
  input: { remoteId?: string; note?: string },
  projectId?: string,
): Promise<ControlAction> {
  if (!hostedDatabaseEnabled()) {
    return mutateActionLocal(workspaceId, actionId, (action) => {
      if (action.state === "completed") throw new TransitionError("completed action cannot be reconciled");
      action.state = "reconciled";
      if (input.remoteId) action.remoteId = String(input.remoteId).slice(0, 200);
      if (input.note) action.note = String(input.note).slice(0, 300);
    }, projectId);
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const current = await sql<DbAction[]>`
      select * from revive_actions where id = ${actionId} and workspace_id = ${workspaceId}
        and (${projectId || null}::text is null or project_id = ${projectId || null}) for update
    `;
    if (!current[0]) throw new TransitionError("action not found", 404);
    if (current[0].state === "completed") throw new TransitionError("completed action cannot be reconciled");
    const rows = await sql<DbAction[]>`
      update revive_actions
      set state = 'reconciled', remote_id = ${input.remoteId?.slice(0, 200) || null},
          note = ${input.note?.slice(0, 300) || null}, version = version + 1, updated_at = now()
      where id = ${actionId} and workspace_id = ${workspaceId}
      returning *
    `;
    return mapAction(rows[0]);
  });
}

function mutateActionLocal(
  workspaceId: string,
  actionId: string,
  mutation: (action: ControlAction) => void,
  projectId?: string,
): ControlAction {
  const data = readLocal();
  const action = data.actions.find((item) => item.id === actionId && item.workspaceId === workspaceId && (!projectId || (item.projectId || "project_default") === projectId));
  if (!action) throw new TransitionError("action not found", 404);
  mutation(action);
  action.version += 1;
  action.updatedAt = Date.now();
  writeLocal(data);
  return action;
}

/** Provider proved the side effect never committed: started|uncertain → prepared,
 *  so the runtime may safely execute it (once) on resume. */
export async function resetActionSafe(workspaceId: string, actionId: string, note?: string, projectId?: string): Promise<ControlAction> {
  if (!hostedDatabaseEnabled()) {
    return mutateActionLocal(workspaceId, actionId, (action) => {
      if (action.state !== "started" && action.state !== "uncertain") {
        throw new TransitionError(`only started/uncertain actions can be reset (state: ${action.state})`);
      }
      action.state = "prepared";
      if (note) action.note = note.slice(0, 300);
    }, projectId);
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbAction[]>`
      update revive_actions
      set state = 'prepared', note = ${note?.slice(0, 300) || null}, version = version + 1, updated_at = now()
      where id = ${actionId} and workspace_id = ${workspaceId}
        and (${projectId || null}::text is null or project_id = ${projectId || null})
        and state in ('started','uncertain')
      returning *
    `;
    if (!rows[0]) throw new TransitionError("only started/uncertain actions can be reset");
    return mapAction(rows[0]);
  });
}

export async function listActionsForRun(workspaceId: string, runId: string, projectId?: string): Promise<ControlAction[]> {
  if (!hostedDatabaseEnabled()) {
    return readLocal().actions.filter((a) => a.workspaceId === workspaceId && a.runId === runId && (!projectId || (a.projectId || "project_default") === projectId));
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbAction[]>`
      select * from revive_actions where workspace_id = ${workspaceId} and run_id = ${runId}
        and (${projectId || null}::text is null or project_id = ${projectId || null}) limit 100
    `;
    return rows.map(mapAction);
  });
}

export async function getAction(workspaceId: string, actionId: string, projectId?: string): Promise<ControlAction | null> {
  if (!hostedDatabaseEnabled()) {
    return readLocal().actions.find((action) => action.id === actionId && action.workspaceId === workspaceId && (!projectId || (action.projectId || "project_default") === projectId)) ?? null;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbAction[]>`
      select * from revive_actions where id = ${actionId} and workspace_id = ${workspaceId}
        and (${projectId || null}::text is null or project_id = ${projectId || null})
    `;
    return rows[0] ? mapAction(rows[0]) : null;
  });
}

export async function listActions(workspaceId: string, projectId?: string): Promise<ControlAction[]> {
  if (!hostedDatabaseEnabled()) {
    return readLocal().actions.filter((action) => action.workspaceId === workspaceId && (!projectId || (action.projectId || "project_default") === projectId))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbAction[]>`
      select * from revive_actions where workspace_id = ${workspaceId}
        and (${projectId || null}::text is null or project_id = ${projectId || null})
      order by updated_at desc limit 500
    `;
    return rows.map(mapAction);
  });
}

export async function openCase(workspaceId: string, input: OpenCaseInput): Promise<ControlCase> {
  if (!hostedDatabaseEnabled()) {
    const projectId = input.projectId || "project_default";
    const data = readLocal();
    const existing = data.cases.find(
      (item) => item.workspaceId === workspaceId && (item.projectId || "project_default") === projectId && item.runId === input.runId &&
        item.actionKey === input.actionKey && !TERMINAL_STATES.has(item.state),
    );
    if (existing) return existing;
    const now = Date.now();
    const caseId = id("case");
    const record: ControlCase = {
      id: caseId, workspaceId, projectId, runId: input.runId, checkpointId: input.checkpointId,
      connectionId: input.connectionId, actionKey: input.actionKey,
      idempotencyKey: input.idempotencyKey, provider: input.provider,
      policy: input.policy || "interactive_reauth", reason: String(input.reason).slice(0, 400),
      state: "detected", version: 1, leaseGeneration: input.leaseGeneration,
      url: createRecoveryAccessUrl(caseId, workspaceId),
      events: [{ at: now, from: null, to: "detected", actor: input.actor || "sdk", note: input.reason.slice(0, 200) }],
      openedAt: now, updatedAt: now,
    };
    data.cases.push(record);
    writeLocal(data);
    return record;
  }

  return withWorkspaceTransaction(workspaceId, async (sql) => {
    if (!input.projectId) {
      const projects = await sql<{ id: string }[]>`select id from revive_projects where workspace_id = ${workspaceId} order by created_at limit 1`;
      input = { ...input, projectId: projects[0]?.id };
    }
    if (!input.projectId) throw new Error("projectId is required to open a recovery case");
    const existing = await sql<DbCase[]>`
      select * from revive_recovery_cases
      where workspace_id = ${workspaceId} and project_id = ${input.projectId}
        and run_id = ${input.runId} and action_key = ${input.actionKey}
        and state not in ('completed','rejected','expired','escalated','manual_review')
      for update
    `;
    if (existing[0]) return mapCase(existing[0]);
    const now = Date.now();
    const caseId = id("case");
    const events: CaseEvent[] = [{
      at: now, from: null, to: "detected", actor: input.actor || "sdk", note: input.reason.slice(0, 200),
    }];
    const jsonEvents = JSON.parse(JSON.stringify(events));
    const inserted = await sql<DbCase[]>`
      insert into revive_recovery_cases
        (id, workspace_id, project_id, run_id, checkpoint_id, connection_id, action_key, idempotency_key,
         provider, policy, reason, state, version, lease_generation, url, events)
      values
        (${caseId}, ${workspaceId}, ${input.projectId}, ${input.runId}, ${input.checkpointId || null}, ${input.connectionId},
         ${input.actionKey}, ${input.idempotencyKey}, ${input.provider || null},
         ${input.policy || "interactive_reauth"}, ${input.reason.slice(0, 400)}, 'detected', 1,
         ${input.leaseGeneration ?? null}, ${createRecoveryAccessUrl(caseId, workspaceId)}, ${sql.json(jsonEvents)})
      on conflict (workspace_id, project_id, run_id, action_key)
        where state not in ('completed','rejected','expired','escalated','manual_review')
      do nothing
      returning *
    `;
    if (inserted[0]) return mapCase(inserted[0]);
    const raced = await sql<DbCase[]>`
      select * from revive_recovery_cases
      where workspace_id = ${workspaceId} and project_id = ${input.projectId}
        and run_id = ${input.runId} and action_key = ${input.actionKey}
        and state not in ('completed','rejected','expired','escalated','manual_review')
      for update
    `;
    if (!raced[0]) throw new Error("recovery case conflict could not be resolved");
    return mapCase(raced[0]);
  });
}

function assertTransition(record: ControlCase, input: TransitionInput): void {
  if (record.version !== input.expectedVersion) {
    throw new TransitionError(`stale version: case is at v${record.version}, transition asserted v${input.expectedVersion}`);
  }
  if (TERMINAL_STATES.has(record.state)) throw new TransitionError(`case is terminal (${record.state})`);
  const escapeTerminal = TERMINAL_STATES.has(input.to) && input.to !== "completed";
  if (!EDGES[record.state].includes(input.to) && !escapeTerminal) {
    throw new TransitionError(`illegal transition ${record.state} → ${input.to}`);
  }
}

// --- credential lease fencing --------------------------------------------------
// The hosted mirror of the sidecar's generation fencing: a lease registry per
// (workspace, connection). Actions registered with an older generation are
// rejected; rotation happens atomically when a case reaches identity_verified.

export async function assertLeaseGeneration(workspaceId: string, connectionId: string, generation: number): Promise<void> {
  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    const leases = data.leases ?? (data.leases = []);
    const lease = leases.find((item) => item.workspaceId === workspaceId && item.connectionId === connectionId);
    if (!lease) {
      leases.push({ workspaceId, connectionId, generation, updatedAt: Date.now() });
      writeLocal(data);
      return;
    }
    if (generation < lease.generation) {
      throw new TransitionError(`stale credential generation ${generation}; lease is at generation ${lease.generation}`);
    }
    if (generation > lease.generation) {
      lease.generation = generation;
      lease.updatedAt = Date.now();
      writeLocal(data);
    }
    return;
  }
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    const inserted = await sql<{ generation: number }[]>`
      insert into revive_leases (workspace_id, connection_id, generation)
      values (${workspaceId}, ${connectionId}, ${generation})
      on conflict (workspace_id, connection_id) do update
        set generation = greatest(revive_leases.generation, excluded.generation), updated_at = now()
      returning generation
    `;
    const current = inserted[0]?.generation ?? generation;
    if (generation < current) {
      throw new TransitionError(`stale credential generation ${generation}; lease is at generation ${current}`);
    }
    return undefined;
  });
}

/** Atomic rotate: expectedGeneration must match or the caller is stale. Returns the new generation. */
export async function getLeaseGeneration(workspaceId: string, connectionId: string): Promise<number> {
  if (!hostedDatabaseEnabled()) {
    const lease = (readLocal().leases ?? []).find((item) => item.workspaceId === workspaceId && item.connectionId === connectionId);
    return lease?.generation ?? 1;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<{ generation: number }[]>`
      select generation from revive_leases where workspace_id = ${workspaceId} and connection_id = ${connectionId}
    `;
    return rows[0]?.generation ?? 1;
  });
}

// Atomic, unconditional advance: every call yields a strictly newer generation
// (the UPDATE increments in one statement, so concurrent completions get
// distinct generations). Workers holding any older generation are fenced.
// Prefer this over rotateLease(expected) when the caller's view of the current
// generation may be stale — e.g. a second recovery on the same connection.
export async function advanceLease(workspaceId: string, connectionId: string): Promise<number> {
  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    const leases = data.leases ?? (data.leases = []);
    let lease = leases.find((item) => item.workspaceId === workspaceId && item.connectionId === connectionId);
    if (!lease) {
      lease = { workspaceId, connectionId, generation: 1, updatedAt: Date.now() };
      leases.push(lease);
    }
    lease.generation += 1;
    lease.updatedAt = Date.now();
    writeLocal(data);
    return lease.generation;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`
      insert into revive_leases (workspace_id, connection_id, generation)
      values (${workspaceId}, ${connectionId}, 1)
      on conflict (workspace_id, connection_id) do nothing
    `;
    const rows = await sql<{ generation: number }[]>`
      update revive_leases
      set generation = generation + 1, updated_at = now()
      where workspace_id = ${workspaceId} and connection_id = ${connectionId}
      returning generation
    `;
    return rows[0].generation;
  });
}

export async function rotateLease(workspaceId: string, connectionId: string, expectedGeneration: number): Promise<number> {
  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    const leases = data.leases ?? (data.leases = []);
    let lease = leases.find((item) => item.workspaceId === workspaceId && item.connectionId === connectionId);
    if (!lease) {
      lease = { workspaceId, connectionId, generation: expectedGeneration, updatedAt: Date.now() };
      leases.push(lease);
    }
    if (lease.generation !== expectedGeneration) {
      throw new TransitionError(`lease rotation conflict: expected generation ${expectedGeneration}, found ${lease.generation}`);
    }
    lease.generation += 1;
    lease.updatedAt = Date.now();
    writeLocal(data);
    return lease.generation;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`
      insert into revive_leases (workspace_id, connection_id, generation)
      values (${workspaceId}, ${connectionId}, ${expectedGeneration})
      on conflict (workspace_id, connection_id) do nothing
    `;
    const rows = await sql<{ generation: number }[]>`
      update revive_leases
      set generation = generation + 1, updated_at = now()
      where workspace_id = ${workspaceId} and connection_id = ${connectionId} and generation = ${expectedGeneration}
      returning generation
    `;
    if (!rows[0]) throw new TransitionError("lease rotation conflict: generation advanced by another worker");
    return rows[0].generation;
  });
}

export async function transition(workspaceId: string, caseId: string, input: TransitionInput, projectId?: string): Promise<ControlCase> {
  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    const record = data.cases.find((item) => item.id === caseId && item.workspaceId === workspaceId && (!projectId || (item.projectId || "project_default") === projectId));
    if (!record) throw new TransitionError("case not found", 404);
    assertTransition(record, input);
    const now = Date.now();
    record.events.push({ at: now, from: record.state, to: input.to, note: input.note?.slice(0, 300), actor: input.actor || "system" });
    record.state = input.to;
    record.version += 1;
    record.updatedAt = now;
    if (TERMINAL_STATES.has(input.to)) record.resolvedAt = now;
    writeLocal(data);
    return record;
  }

  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbCase[]>`
      select * from revive_recovery_cases where id = ${caseId} and workspace_id = ${workspaceId}
        and (${projectId || null}::text is null or project_id = ${projectId || null}) for update
    `;
    if (!rows[0]) throw new TransitionError("case not found", 404);
    const record = mapCase(rows[0]);
    assertTransition(record, input);
    const event: CaseEvent = {
      at: Date.now(), from: record.state, to: input.to,
      note: input.note?.slice(0, 300), actor: input.actor || "system",
    };
    const events = [...record.events, event];
    const jsonEvents = JSON.parse(JSON.stringify(events));
    const terminal = TERMINAL_STATES.has(input.to);
    const updated = await sql<DbCase[]>`
      update revive_recovery_cases
      set state = ${input.to}, version = version + 1, events = ${sql.json(jsonEvents)},
          updated_at = now(), resolved_at = case when ${terminal} then now() else resolved_at end
      where id = ${caseId} and workspace_id = ${workspaceId} and version = ${input.expectedVersion}
      returning *
    `;
    if (!updated[0]) throw new TransitionError("stale case version");
    return mapCase(updated[0]);
  });
}

export async function getCase(workspaceId: string, caseId: string, projectId?: string): Promise<ControlCase | null> {
  if (!hostedDatabaseEnabled()) {
    return readLocal().cases.find((item) => item.id === caseId && item.workspaceId === workspaceId && (!projectId || (item.projectId || "project_default") === projectId)) ?? null;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbCase[]>`
      select * from revive_recovery_cases where id = ${caseId} and workspace_id = ${workspaceId}
        and (${projectId || null}::text is null or project_id = ${projectId || null}) limit 1
    `;
    return rows[0] ? mapCase(rows[0]) : null;
  });
}

export async function listCases(workspaceId: string, filter?: { open?: boolean; projectId?: string }): Promise<ControlCase[]> {
  if (!hostedDatabaseEnabled()) {
    let cases = readLocal().cases.filter((item) => item.workspaceId === workspaceId && (!filter?.projectId || (item.projectId || "project_default") === filter.projectId));
    if (filter?.open) cases = cases.filter((item) => !TERMINAL_STATES.has(item.state));
    return cases.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = filter?.open
      ? await sql<DbCase[]>`
          select * from revive_recovery_cases
          where workspace_id = ${workspaceId}
            and (${filter.projectId || null}::text is null or project_id = ${filter.projectId || null})
            and state not in ('completed','rejected','expired','escalated','manual_review')
          order by updated_at desc limit 500
        `
      : await sql<DbCase[]>`
          select * from revive_recovery_cases where workspace_id = ${workspaceId}
            and (${filter?.projectId || null}::text is null or project_id = ${filter?.projectId || null})
          order by updated_at desc limit 500
        `;
    return rows.map(mapCase);
  });
}
