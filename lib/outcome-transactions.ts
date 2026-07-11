import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { hostedDatabaseEnabled, withWorkspaceTransaction } from "./hosted";
import { TransitionError } from "./control-plane";

export type ContractStatus = "draft" | "active" | "archived";
export type ContractApprovalMode = "never" | "policy" | "always";
export type TransactionState =
  | "planned"
  | "awaiting_approval"
  | "executing"
  | "verifying"
  | "verified"
  | "recovering"
  | "compensated"
  | "needs_human"
  | "cancelled";
export type TransactionStepState =
  | "planned"
  | "executing"
  | "succeeded"
  | "verifying"
  | "verified"
  | "unknown"
  | "failed"
  | "compensating"
  | "compensated"
  | "skipped";

export interface OutcomeRule {
  key: string;
  label: string;
  provider?: string;
  expectedState?: string;
}

export interface OutcomeContract {
  id: string;
  workspaceId: string;
  projectId: string;
  key: string;
  name: string;
  description: string;
  version: number;
  status: ContractStatus;
  approvalMode: ContractApprovalMode;
  preconditions: OutcomeRule[];
  requiredOutcomes: OutcomeRule[];
  compensation: OutcomeRule[];
  createdAt: number;
  updatedAt: number;
}

export interface TransactionApproval {
  status: "pending" | "approved" | "denied";
  requestedAt: number;
  requestedBy: string;
  decidedAt?: number;
  decidedBy?: string;
  reason?: string;
}

export interface TransactionTraceContext {
  provider?: string;
  traceId?: string;
  spanId?: string;
  traceUrl?: string;
}

export interface OutcomeTransactionStep {
  id: string;
  workspaceId: string;
  projectId: string;
  transactionId: string;
  key: string;
  position: number;
  actionId?: string;
  actionKey: string;
  connectionId: string;
  state: TransactionStepState;
  version: number;
  expectedOutcome?: OutcomeRule;
  evidence?: Record<string, string | number | boolean>;
  remoteId?: string;
  reversible: boolean;
  compensationActionKey?: string;
  note?: string;
  startedAt?: number;
  settledAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface OutcomeTransaction {
  id: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  contractId?: string;
  contractKey: string;
  idempotencyKey: string;
  title: string;
  state: TransactionState;
  version: number;
  approval?: TransactionApproval;
  traceContext?: TransactionTraceContext;
  inputRef?: string;
  resultSummary?: string;
  steps: OutcomeTransactionStep[];
  createdAt: number;
  updatedAt: number;
  settledAt?: number;
}

export const BUILT_IN_OUTCOME_CONTRACTS = [
  {
    key: "customer-refund-and-cancel",
    name: "Refund and cancel",
    description: "Refund a settled payment, cancel the subscription, update the customer record, and confirm the final state.",
    approvalMode: "policy" as const,
    preconditions: [{ key: "payment-settled", label: "Payment is settled", provider: "payments", expectedState: "settled" }],
    requiredOutcomes: [
      { key: "refund-settled", label: "Refund is settled", provider: "payments", expectedState: "settled" },
      { key: "subscription-cancelled", label: "Subscription is cancelled", provider: "billing", expectedState: "cancelled" },
      { key: "customer-updated", label: "Customer record reflects cancellation", provider: "crm", expectedState: "updated" },
    ],
    compensation: [{ key: "escalate-refund", label: "Escalate if cancellation cannot be proved", expectedState: "needs_human" }],
  },
  {
    key: "customer-message-delivered",
    name: "Customer message delivered",
    description: "Create one outbound message, prove provider acceptance, and stop duplicate delivery during retries.",
    approvalMode: "policy" as const,
    preconditions: [{ key: "recipient-valid", label: "Recipient is eligible for contact", expectedState: "allowed" }],
    requiredOutcomes: [{ key: "message-delivered", label: "Provider confirms delivery or acceptance", provider: "messaging", expectedState: "delivered" }],
    compensation: [{ key: "open-delivery-case", label: "Open an exception when delivery stays unknown", expectedState: "needs_human" }],
  },
  {
    key: "production-change-verified",
    name: "Production change verified",
    description: "Apply one approved production change, verify the deployed state, and preserve the rollback path.",
    approvalMode: "always" as const,
    preconditions: [{ key: "source-current", label: "Approved source generation is still current", expectedState: "current" }],
    requiredOutcomes: [{ key: "deployment-healthy", label: "Deployment is active and healthy", provider: "deployment", expectedState: "healthy" }],
    compensation: [{ key: "rollback", label: "Roll back to the prior verified generation", provider: "deployment", expectedState: "rolled_back" }],
  },
] as const;

type LocalPlane = { contracts: OutcomeContract[]; transactions: OutcomeTransaction[] };
const directory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
const localFile = path.join(directory, "outcome-plane.json");

function readLocal(): LocalPlane {
  try {
    const parsed = JSON.parse(fs.readFileSync(localFile, "utf8")) as LocalPlane;
    return { contracts: parsed.contracts ?? [], transactions: parsed.transactions ?? [] };
  } catch {
    return { contracts: [], transactions: [] };
  }
}

function writeLocal(data: LocalPlane): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${localFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, localFile);
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

function bounded(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function contractKey(value: unknown): string {
  return bounded(value, 100).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeRule(value: unknown, index: number): OutcomeRule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const label = bounded(source.label, 180);
  if (!label) return null;
  return {
    key: contractKey(source.key) || `rule-${index + 1}`,
    label,
    ...(bounded(source.provider, 80) ? { provider: bounded(source.provider, 80) } : {}),
    ...(bounded(source.expectedState, 100) ? { expectedState: bounded(source.expectedState, 100) } : {}),
  };
}

function normalizeRules(value: unknown, max = 30): OutcomeRule[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, max).map(normalizeRule).filter((rule): rule is OutcomeRule => Boolean(rule));
}

function normalizeTraceContext(value: unknown): TransactionTraceContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const trace: TransactionTraceContext = {};
  if (bounded(source.provider, 50)) trace.provider = bounded(source.provider, 50);
  if (bounded(source.traceId, 200)) trace.traceId = bounded(source.traceId, 200);
  if (bounded(source.spanId, 200)) trace.spanId = bounded(source.spanId, 200);
  const url = bounded(source.traceUrl, 1000);
  if (url && /^https:\/\//i.test(url)) trace.traceUrl = url;
  return Object.keys(trace).length ? trace : undefined;
}

function normalizeEvidence(value: unknown): Record<string, string | number | boolean> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const evidence: Record<string, string | number | boolean> = {};
  for (const key of ["provider", "status", "verifier", "detail", "source", "externalState"] as const) {
    if (typeof source[key] === "string" && source[key]) evidence[key] = source[key].slice(0, key === "detail" ? 400 : 160);
  }
  if (typeof source.checkedAt === "number" && Number.isFinite(source.checkedAt)) evidence.checkedAt = source.checkedAt;
  if (typeof source.confirmed === "boolean") evidence.confirmed = source.confirmed;
  return Object.keys(evidence).length ? evidence : undefined;
}

function timestamp(value: Date | string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function deriveTransactionState(steps: OutcomeTransactionStep[], approval?: TransactionApproval): TransactionState {
  if (approval?.status === "pending") return "awaiting_approval";
  if (approval?.status === "denied") return "cancelled";
  if (!steps.length || steps.every((step) => step.state === "planned" || step.state === "skipped")) return "planned";
  if (steps.some((step) => step.state === "failed")) return "needs_human";
  if (steps.some((step) => step.state === "unknown" || step.state === "compensating")) return "recovering";
  const terminal = steps.every((step) => ["verified", "compensated", "skipped"].includes(step.state));
  if (terminal) return steps.some((step) => step.state === "compensated") ? "compensated" : "verified";
  if (steps.some((step) => step.state === "succeeded" || step.state === "verifying")) return "verifying";
  return "executing";
}

const STEP_EDGES: Record<TransactionStepState, TransactionStepState[]> = {
  planned: ["executing", "skipped"],
  executing: ["succeeded", "unknown", "failed"],
  succeeded: ["verifying", "verified", "unknown", "failed"],
  verifying: ["verified", "unknown", "failed"],
  verified: [],
  unknown: ["verifying", "verified", "failed", "compensating"],
  failed: ["compensating"],
  compensating: ["compensated", "failed"],
  compensated: [],
  skipped: [],
};

interface DbContract {
  id: string; workspace_id: string; project_id: string; contract_key: string; name: string; description: string;
  version: number; status: ContractStatus; approval_mode: ContractApprovalMode; preconditions: unknown;
  required_outcomes: unknown; compensation: unknown; created_at: Date | string; updated_at: Date | string;
}
interface DbTransaction {
  id: string; workspace_id: string; project_id: string; run_id: string; contract_id: string | null; contract_key: string;
  idempotency_key: string; title: string; state: TransactionState; version: number | string; approval: TransactionApproval | null;
  trace_context: TransactionTraceContext | null; input_ref: string | null; result_summary: string | null;
  created_at: Date | string; updated_at: Date | string; settled_at: Date | string | null;
}
interface DbStep {
  id: string; workspace_id: string; project_id: string; transaction_id: string; step_key: string; position: number;
  action_id: string | null; action_key: string; connection_id: string; state: TransactionStepState; version: number | string;
  expected_outcome: OutcomeRule | null; evidence: Record<string, string | number | boolean> | null; remote_id: string | null;
  reversible: boolean; compensation_action_key: string | null; note: string | null; started_at: Date | string | null;
  settled_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
}

function mapContract(row: DbContract): OutcomeContract {
  return {
    id: row.id, workspaceId: row.workspace_id, projectId: row.project_id, key: row.contract_key,
    name: row.name, description: row.description, version: Number(row.version), status: row.status,
    approvalMode: row.approval_mode, preconditions: normalizeRules(row.preconditions),
    requiredOutcomes: normalizeRules(row.required_outcomes), compensation: normalizeRules(row.compensation),
    createdAt: timestamp(row.created_at)!, updatedAt: timestamp(row.updated_at)!,
  };
}

function mapStep(row: DbStep): OutcomeTransactionStep {
  return {
    id: row.id, workspaceId: row.workspace_id, projectId: row.project_id, transactionId: row.transaction_id,
    key: row.step_key, position: row.position, actionId: row.action_id || undefined, actionKey: row.action_key,
    connectionId: row.connection_id, state: row.state, version: Number(row.version),
    expectedOutcome: row.expected_outcome || undefined, evidence: row.evidence || undefined,
    remoteId: row.remote_id || undefined, reversible: row.reversible,
    compensationActionKey: row.compensation_action_key || undefined, note: row.note || undefined,
    startedAt: timestamp(row.started_at), settledAt: timestamp(row.settled_at),
    createdAt: timestamp(row.created_at)!, updatedAt: timestamp(row.updated_at)!,
  };
}

function mapTransaction(row: DbTransaction, steps: DbStep[] = []): OutcomeTransaction {
  return {
    id: row.id, workspaceId: row.workspace_id, projectId: row.project_id, runId: row.run_id,
    contractId: row.contract_id || undefined, contractKey: row.contract_key, idempotencyKey: row.idempotency_key,
    title: row.title, state: row.state, version: Number(row.version), approval: row.approval || undefined,
    traceContext: row.trace_context || undefined, inputRef: row.input_ref || undefined,
    resultSummary: row.result_summary || undefined, steps: steps.map(mapStep).sort((a, b) => a.position - b.position),
    createdAt: timestamp(row.created_at)!, updatedAt: timestamp(row.updated_at)!, settledAt: timestamp(row.settled_at),
  };
}

async function defaultProject(sql: Sql, workspaceId: string, requested?: string): Promise<string> {
  if (requested) return requested;
  const rows = await sql<{ id: string }[]>`select id from revive_projects where workspace_id = ${workspaceId} order by created_at limit 1`;
  if (!rows[0]?.id) throw new Error("projectId is required");
  return rows[0].id;
}

export async function createOutcomeContract(workspaceId: string, input: {
  projectId?: string; key: string; name: string; description?: string; status?: ContractStatus;
  approvalMode?: ContractApprovalMode; preconditions?: unknown; requiredOutcomes?: unknown; compensation?: unknown;
}): Promise<OutcomeContract> {
  const key = contractKey(input.key);
  const name = bounded(input.name, 120);
  if (!key || !name) throw new TransitionError("contract key and name are required", 400);
  const status = input.status && ["draft", "active", "archived"].includes(input.status) ? input.status : "active";
  const approvalMode = input.approvalMode && ["never", "policy", "always"].includes(input.approvalMode) ? input.approvalMode : "policy";
  const preconditions = normalizeRules(input.preconditions);
  const requiredOutcomes = normalizeRules(input.requiredOutcomes);
  const compensation = normalizeRules(input.compensation);
  if (!requiredOutcomes.length) throw new TransitionError("at least one required outcome is required", 400);
  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    const projectId = input.projectId || "project_default";
    const version = 1 + Math.max(0, ...data.contracts.filter((item) => item.workspaceId === workspaceId && item.projectId === projectId && item.key === key).map((item) => item.version));
    const now = Date.now();
    const record: OutcomeContract = { id: newId("oct"), workspaceId, projectId, key, name, description: bounded(input.description, 600), version, status, approvalMode, preconditions, requiredOutcomes, compensation, createdAt: now, updatedAt: now };
    data.contracts.push(record); writeLocal(data); return record;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const projectId = await defaultProject(sql, workspaceId, input.projectId);
    const versions = await sql<{ version: number }[]>`select coalesce(max(version), 0)::int as version from revive_outcome_contracts where workspace_id = ${workspaceId} and project_id = ${projectId} and contract_key = ${key}`;
    const version = (versions[0]?.version || 0) + 1;
    const rows = await sql<DbContract[]>`
      insert into revive_outcome_contracts
        (id, workspace_id, project_id, contract_key, name, description, version, status, approval_mode, preconditions, required_outcomes, compensation)
      values (${newId("oct")}, ${workspaceId}, ${projectId}, ${key}, ${name}, ${bounded(input.description, 600)}, ${version}, ${status}, ${approvalMode},
        ${sql.json(JSON.parse(JSON.stringify(preconditions)))}, ${sql.json(JSON.parse(JSON.stringify(requiredOutcomes)))}, ${sql.json(JSON.parse(JSON.stringify(compensation)))}) returning *`;
    return mapContract(rows[0]);
  });
}

export async function listOutcomeContracts(workspaceId: string, projectId?: string): Promise<OutcomeContract[]> {
  if (!hostedDatabaseEnabled()) return readLocal().contracts.filter((item) => item.workspaceId === workspaceId && (!projectId || item.projectId === projectId)).sort((a, b) => b.updatedAt - a.updatedAt);
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbContract[]>`select * from revive_outcome_contracts where workspace_id = ${workspaceId} and (${projectId || null}::text is null or project_id = ${projectId || null}) order by updated_at desc limit 200`;
    return rows.map(mapContract);
  });
}

export async function getOutcomeContract(workspaceId: string, contractId: string, projectId?: string): Promise<OutcomeContract | null> {
  if (!hostedDatabaseEnabled()) return readLocal().contracts.find((item) => item.workspaceId === workspaceId && item.id === contractId && (!projectId || item.projectId === projectId)) || null;
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbContract[]>`select * from revive_outcome_contracts where id = ${contractId} and workspace_id = ${workspaceId} and (${projectId || null}::text is null or project_id = ${projectId || null})`;
    return rows[0] ? mapContract(rows[0]) : null;
  });
}

type CreateStepInput = { key: string; actionKey: string; connectionId: string; actionId?: string; expectedOutcome?: unknown; reversible?: boolean; compensationActionKey?: string };

function normalizeStep(input: CreateStepInput, position: number) {
  const key = contractKey(input.key) || `step-${position + 1}`;
  const actionKey = bounded(input.actionKey, 200);
  const connectionId = bounded(input.connectionId, 200);
  if (!actionKey || !connectionId) throw new TransitionError(`step ${key} requires actionKey and connectionId`, 400);
  return {
    key, actionKey, connectionId, actionId: bounded(input.actionId, 200) || undefined,
    expectedOutcome: normalizeRule(input.expectedOutcome, position) || undefined,
    reversible: input.reversible === true,
    compensationActionKey: bounded(input.compensationActionKey, 200) || undefined,
  };
}

export async function createOutcomeTransaction(workspaceId: string, input: {
  projectId?: string; runId: string; contractKey: string; idempotencyKey: string; title?: string;
  requireApproval?: boolean; requestedBy?: string; traceContext?: unknown; inputRef?: string; steps: CreateStepInput[];
}): Promise<OutcomeTransaction> {
  const runId = bounded(input.runId, 200); const key = contractKey(input.contractKey); const idempotencyKey = bounded(input.idempotencyKey, 200);
  if (!runId || !key || !idempotencyKey) throw new TransitionError("runId, contractKey and idempotencyKey are required", 400);
  if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 50) throw new TransitionError("transactions require 1-50 steps", 400);
  const normalizedSteps = input.steps.map(normalizeStep);
  if (new Set(normalizedSteps.map((step) => step.key)).size !== normalizedSteps.length) throw new TransitionError("transaction step keys must be unique", 400);
  const traceContext = normalizeTraceContext(input.traceContext);
  if (!hostedDatabaseEnabled()) {
    const data = readLocal(); const projectId = input.projectId || "project_default";
    const existing = data.transactions.find((item) => item.workspaceId === workspaceId && item.projectId === projectId && item.contractKey === key && item.idempotencyKey === idempotencyKey);
    if (existing) return existing;
    const contract = data.contracts.filter((item) => item.workspaceId === workspaceId && item.projectId === projectId && item.key === key && item.status === "active").sort((a, b) => b.version - a.version)[0];
    const requireApproval = input.requireApproval === true || contract?.approvalMode === "always" || BUILT_IN_OUTCOME_CONTRACTS.find((item) => item.key === key)?.approvalMode === "always";
    const now = Date.now(); const transactionId = newId("txn");
    const approval = requireApproval ? { status: "pending" as const, requestedAt: now, requestedBy: bounded(input.requestedBy, 160) || "sdk" } : undefined;
    const steps: OutcomeTransactionStep[] = normalizedSteps.map((step, position) => ({ id: newId("txs"), workspaceId, projectId, transactionId, ...step, position, state: "planned", version: 1, createdAt: now, updatedAt: now }));
    const record: OutcomeTransaction = { id: transactionId, workspaceId, projectId, runId, contractId: contract?.id, contractKey: key, idempotencyKey, title: bounded(input.title, 180) || contract?.name || key.replaceAll("-", " "), state: approval ? "awaiting_approval" : "planned", version: 1, approval, traceContext, inputRef: bounded(input.inputRef, 1000) || undefined, steps, createdAt: now, updatedAt: now };
    data.transactions.push(record); writeLocal(data); return record;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const projectId = await defaultProject(sql, workspaceId, input.projectId);
    const existing = await sql<DbTransaction[]>`select * from revive_transactions where workspace_id = ${workspaceId} and project_id = ${projectId} and contract_key = ${key} and idempotency_key = ${idempotencyKey}`;
    if (existing[0]) {
      const steps = await sql<DbStep[]>`select * from revive_transaction_steps where transaction_id = ${existing[0].id} order by position`;
      return mapTransaction(existing[0], steps);
    }
    const contracts = await sql<DbContract[]>`select * from revive_outcome_contracts where workspace_id = ${workspaceId} and project_id = ${projectId} and contract_key = ${key} and status = 'active' order by version desc limit 1`;
    const contract = contracts[0] ? mapContract(contracts[0]) : undefined;
    const builtIn = BUILT_IN_OUTCOME_CONTRACTS.find((item) => item.key === key);
    const requireApproval = input.requireApproval === true || contract?.approvalMode === "always" || builtIn?.approvalMode === "always";
    const now = Date.now(); const transactionId = newId("txn");
    const approval = requireApproval ? { status: "pending" as const, requestedAt: now, requestedBy: bounded(input.requestedBy, 160) || "sdk" } : undefined;
    const inserted = await sql<DbTransaction[]>`
      insert into revive_transactions (id, workspace_id, project_id, run_id, contract_id, contract_key, idempotency_key, title, state, approval, trace_context, input_ref)
      values (${transactionId}, ${workspaceId}, ${projectId}, ${runId}, ${contract?.id || null}, ${key}, ${idempotencyKey}, ${bounded(input.title, 180) || contract?.name || builtIn?.name || key.replaceAll("-", " ")},
        ${approval ? "awaiting_approval" : "planned"}, ${approval ? sql.json(JSON.parse(JSON.stringify(approval))) : null}, ${traceContext ? sql.json(JSON.parse(JSON.stringify(traceContext))) : null}, ${bounded(input.inputRef, 1000) || null}) returning *`;
    const stepRows: DbStep[] = [];
    for (let position = 0; position < normalizedSteps.length; position += 1) {
      const step = normalizedSteps[position];
      if (step.actionId) {
        const actions = await sql<{ id: string }[]>`select id from revive_actions where id = ${step.actionId} and workspace_id = ${workspaceId} and project_id = ${projectId}`;
        if (!actions[0]) throw new TransitionError(`step ${step.key} actionId was not found in this project`, 404);
      }
      const rows = await sql<DbStep[]>`
        insert into revive_transaction_steps
          (id, workspace_id, project_id, transaction_id, step_key, position, action_id, action_key, connection_id, expected_outcome, reversible, compensation_action_key)
        values (${newId("txs")}, ${workspaceId}, ${projectId}, ${transactionId}, ${step.key}, ${position}, ${step.actionId || null}, ${step.actionKey}, ${step.connectionId},
          ${step.expectedOutcome ? sql.json(JSON.parse(JSON.stringify(step.expectedOutcome))) : null}, ${step.reversible}, ${step.compensationActionKey || null}) returning *`;
      stepRows.push(rows[0]);
    }
    return mapTransaction(inserted[0], stepRows);
  });
}

async function getDbTransaction(sql: Sql, workspaceId: string, transactionId: string, projectId?: string): Promise<OutcomeTransaction | null> {
  const rows = await sql<DbTransaction[]>`select * from revive_transactions where id = ${transactionId} and workspace_id = ${workspaceId} and (${projectId || null}::text is null or project_id = ${projectId || null})`;
  if (!rows[0]) return null;
  const steps = await sql<DbStep[]>`select * from revive_transaction_steps where transaction_id = ${transactionId} order by position`;
  return mapTransaction(rows[0], steps);
}

export async function getOutcomeTransaction(workspaceId: string, transactionId: string, projectId?: string): Promise<OutcomeTransaction | null> {
  if (!hostedDatabaseEnabled()) return readLocal().transactions.find((item) => item.workspaceId === workspaceId && item.id === transactionId && (!projectId || item.projectId === projectId)) || null;
  return withWorkspaceTransaction(workspaceId, (sql) => getDbTransaction(sql, workspaceId, transactionId, projectId));
}

export async function listOutcomeTransactions(workspaceId: string, projectId?: string): Promise<OutcomeTransaction[]> {
  if (!hostedDatabaseEnabled()) return readLocal().transactions.filter((item) => item.workspaceId === workspaceId && (!projectId || item.projectId === projectId)).sort((a, b) => b.updatedAt - a.updatedAt);
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbTransaction[]>`select * from revive_transactions where workspace_id = ${workspaceId} and (${projectId || null}::text is null or project_id = ${projectId || null}) order by updated_at desc limit 300`;
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const steps = await sql<DbStep[]>`select * from revive_transaction_steps where transaction_id = any(${ids}) order by transaction_id, position`;
    const byTransaction = new Map<string, DbStep[]>();
    for (const step of steps) byTransaction.set(step.transaction_id, [...(byTransaction.get(step.transaction_id) || []), step]);
    return rows.map((row) => mapTransaction(row, byTransaction.get(row.id) || []));
  });
}

export async function decideTransactionApproval(workspaceId: string, transactionId: string, input: { decision: "approve" | "deny"; actor: string; reason?: string; projectId?: string }): Promise<OutcomeTransaction> {
  const now = Date.now();
  if (!hostedDatabaseEnabled()) {
    const data = readLocal(); const transaction = data.transactions.find((item) => item.workspaceId === workspaceId && item.id === transactionId && (!input.projectId || item.projectId === input.projectId));
    if (!transaction) throw new TransitionError("transaction not found", 404);
    if (transaction.approval?.status !== "pending") throw new TransitionError("transaction is not awaiting approval");
    transaction.approval = { ...transaction.approval, status: input.decision === "approve" ? "approved" : "denied", decidedAt: now, decidedBy: bounded(input.actor, 160), reason: bounded(input.reason, 300) || undefined };
    transaction.state = deriveTransactionState(transaction.steps, transaction.approval); transaction.version += 1; transaction.updatedAt = now;
    if (transaction.state === "cancelled") transaction.settledAt = now;
    writeLocal(data); return transaction;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const current = await getDbTransaction(sql, workspaceId, transactionId, input.projectId);
    if (!current) throw new TransitionError("transaction not found", 404);
    if (current.approval?.status !== "pending") throw new TransitionError("transaction is not awaiting approval");
    const approval: TransactionApproval = { ...current.approval, status: input.decision === "approve" ? "approved" : "denied", decidedAt: now, decidedBy: bounded(input.actor, 160), reason: bounded(input.reason, 300) || undefined };
    const state = deriveTransactionState(current.steps, approval);
    await sql`update revive_transactions set approval = ${sql.json(JSON.parse(JSON.stringify(approval)))}, state = ${state}, version = version + 1, updated_at = now(), settled_at = ${state === "cancelled" ? new Date(now) : null} where id = ${transactionId} and workspace_id = ${workspaceId}`;
    return (await getDbTransaction(sql, workspaceId, transactionId, input.projectId))!;
  });
}

export async function transitionTransactionStep(workspaceId: string, transactionId: string, stepKey: string, input: {
  to: TransactionStepState; expectedVersion: number; projectId?: string; actionId?: string; remoteId?: string;
  evidence?: unknown; note?: string; resultSummary?: string;
}): Promise<OutcomeTransaction> {
  const key = contractKey(stepKey); const to = input.to;
  if (!STEP_EDGES[to]) throw new TransitionError("invalid step state", 400);
  if (!hostedDatabaseEnabled()) {
    const data = readLocal(); const transaction = data.transactions.find((item) => item.workspaceId === workspaceId && item.id === transactionId && (!input.projectId || item.projectId === input.projectId));
    if (!transaction) throw new TransitionError("transaction not found", 404);
    if (transaction.state === "awaiting_approval" || transaction.state === "cancelled") throw new TransitionError(`transaction is ${transaction.state}`);
    const step = transaction.steps.find((item) => item.key === key); if (!step) throw new TransitionError("transaction step not found", 404);
    if (step.version !== input.expectedVersion) throw new TransitionError(`stale step version: expected ${input.expectedVersion}, found ${step.version}`);
    if (!STEP_EDGES[step.state].includes(to)) throw new TransitionError(`illegal step transition ${step.state} → ${to}`);
    const now = Date.now(); step.state = to; step.version += 1; step.updatedAt = now;
    if (to === "executing") step.startedAt = now;
    if (["verified", "compensated", "skipped"].includes(to)) step.settledAt = now;
    if (bounded(input.actionId, 200)) step.actionId = bounded(input.actionId, 200);
    if (bounded(input.remoteId, 200)) step.remoteId = bounded(input.remoteId, 200);
    if (bounded(input.note, 400)) step.note = bounded(input.note, 400);
    step.evidence = normalizeEvidence(input.evidence);
    transaction.state = deriveTransactionState(transaction.steps, transaction.approval); transaction.version += 1; transaction.updatedAt = now;
    if (["verified", "compensated", "cancelled"].includes(transaction.state)) transaction.settledAt = now;
    if (bounded(input.resultSummary, 1000)) transaction.resultSummary = bounded(input.resultSummary, 1000);
    writeLocal(data); return transaction;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const transaction = await getDbTransaction(sql, workspaceId, transactionId, input.projectId);
    if (!transaction) throw new TransitionError("transaction not found", 404);
    if (transaction.state === "awaiting_approval" || transaction.state === "cancelled") throw new TransitionError(`transaction is ${transaction.state}`);
    const step = transaction.steps.find((item) => item.key === key); if (!step) throw new TransitionError("transaction step not found", 404);
    if (step.version !== input.expectedVersion) throw new TransitionError(`stale step version: expected ${input.expectedVersion}, found ${step.version}`);
    if (!STEP_EDGES[step.state].includes(to)) throw new TransitionError(`illegal step transition ${step.state} → ${to}`);
    if (bounded(input.actionId, 200)) {
      const actions = await sql<{ id: string }[]>`select id from revive_actions where id = ${bounded(input.actionId, 200)} and workspace_id = ${workspaceId} and project_id = ${transaction.projectId}`;
      if (!actions[0]) throw new TransitionError("actionId was not found in this transaction project", 404);
    }
    const evidence = normalizeEvidence(input.evidence); const settles = ["verified", "compensated", "skipped"].includes(to);
    const rows = await sql<DbStep[]>`
      update revive_transaction_steps set state = ${to}, version = version + 1, updated_at = now(),
        started_at = case when ${to} = 'executing' then now() else started_at end,
        settled_at = case when ${settles} then now() else settled_at end,
        action_id = coalesce(${bounded(input.actionId, 200) || null}, action_id), remote_id = coalesce(${bounded(input.remoteId, 200) || null}, remote_id),
        evidence = ${evidence ? sql.json(evidence) : null}, note = coalesce(${bounded(input.note, 400) || null}, note)
      where id = ${step.id} and workspace_id = ${workspaceId} and version = ${input.expectedVersion} returning *`;
    if (!rows[0]) throw new TransitionError("transaction step changed concurrently");
    const nextSteps = transaction.steps.map((item) => item.id === step.id ? mapStep(rows[0]) : item);
    const state = deriveTransactionState(nextSteps, transaction.approval);
    const settled = ["verified", "compensated", "cancelled"].includes(state);
    await sql`update revive_transactions set state = ${state}, version = version + 1, updated_at = now(), settled_at = case when ${settled} then now() else settled_at end, result_summary = coalesce(${bounded(input.resultSummary, 1000) || null}, result_summary) where id = ${transactionId} and workspace_id = ${workspaceId}`;
    return (await getDbTransaction(sql, workspaceId, transactionId, input.projectId))!;
  });
}
