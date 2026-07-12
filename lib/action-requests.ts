import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Sql } from "postgres";
import { TransitionError } from "./control-plane";
import { hostedDatabaseEnabled, withWorkspaceTransaction } from "./hosted";
import { openJson, sealJson, sha256Base64Url } from "./secure-envelope";
import type { ResolutionValidationResult, ResumeAssessment } from "./resolution-intelligence";

export type UserActionType =
  | "approval"
  | "structured_input"
  | "clarification"
  | "reauthorization"
  | "verification"
  | "permission"
  | "browser_handoff"
  | "document_request";
export type UserActionStatus = "pending" | "completed" | "cancelled" | "expired";
export type ResumeStatus = "not_configured" | "queued" | "acknowledged" | "failed" | "held_for_review";
export type IdentityMode = "secure_link" | "authenticated";
export type UserActionFieldType = "text" | "textarea" | "select" | "boolean" | "currency" | "email" | "url" | "date" | "file_url";

export interface UserActionRecipient {
  subjectId: string;
  email: string;
  role?: string;
}

export interface UserActionField {
  key: string;
  type: UserActionFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  requiredWhen?: { field: string; equals: string | boolean };
}

export interface CompletedBy {
  subjectId: string;
  email: string;
  verification: "secure_link" | "authenticated_email";
}

export interface UserActionRequest {
  id: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  checkpointId?: string;
  actionType: UserActionType;
  idempotencyKey: string;
  title: string;
  description: string;
  recipient: UserActionRecipient;
  fields: UserActionField[];
  context: Record<string, unknown>;
  identityMode: IdentityMode;
  destinationUrl?: string;
  status: UserActionStatus;
  generation: number;
  response?: Record<string, unknown>;
  completedBy?: CompletedBy;
  completedAt?: number;
  expiresAt: number;
  resumeStatus: ResumeStatus;
  resumeJobId?: string;
  delivery: { email?: boolean; slack?: boolean; attemptedAt?: number };
  validation?: { mode: "schema" | "claude"; criterion?: string; deadRunId?: string };
  validationResult?: ResolutionValidationResult;
  resumeAssessment?: ResumeAssessment;
  requestedBy: string;
  createdAt: number;
  updatedAt: number;
  url?: string;
}

export interface PublicUserActionRequest {
  id: string;
  runId: string;
  checkpointId?: string;
  actionType: UserActionType;
  title: string;
  description: string;
  recipientHint: string;
  fields: UserActionField[];
  context: Record<string, unknown>;
  identityMode: IdentityMode;
  destinationUrl?: string;
  status: UserActionStatus;
  generation: number;
  completedAt?: number;
  expiresAt: number;
  resumeStatus: ResumeStatus;
  validationPassed?: boolean;
  resumeDecision?: ResumeAssessment["decision"];
}

type StoredRequest = UserActionRequest & { tokenHash: string; tokenCiphertext: string };
type LocalPlane = { requests: StoredRequest[] };
const directory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
const localFile = path.join(directory, "action-requests.json");

const ACTION_TYPES = new Set<UserActionType>([
  "approval", "structured_input", "clarification", "reauthorization", "verification", "permission", "browser_handoff", "document_request",
]);
const FIELD_TYPES = new Set<UserActionFieldType>(["text", "textarea", "select", "boolean", "currency", "email", "url", "date", "file_url"]);

const DEFAULT_FIELDS: Record<Exclude<UserActionType, "structured_input">, UserActionField[]> = {
  approval: [
    { key: "decision", type: "select", label: "Decision", required: true, options: [
      { value: "approve", label: "Approve" }, { value: "modify", label: "Approve with changes" }, { value: "reject", label: "Reject" },
    ] },
    { key: "instructions", type: "textarea", label: "Changes or instructions", required: false, requiredWhen: { field: "decision", equals: "modify" } },
  ],
  clarification: [{ key: "answer", type: "textarea", label: "Information needed to continue", description: "Provide the specific detail requested by the workflow.", placeholder: "Enter the requested information", required: true }],
  reauthorization: [{ key: "completed", type: "boolean", label: "I restored access", required: true }],
  verification: [{ key: "result", type: "select", label: "What happened?", required: true, options: [
    { value: "confirmed", label: "The action happened" }, { value: "not_happened", label: "The action did not happen" }, { value: "unsure", label: "I cannot confirm" },
  ] }],
  permission: [{ key: "decision", type: "select", label: "Permission decision", required: true, options: [
    { value: "grant", label: "Grant access" }, { value: "deny", label: "Deny access" },
  ] }],
  browser_handoff: [
    { key: "completed", type: "boolean", label: "I completed the browser step", required: true },
    { key: "notes", type: "textarea", label: "Notes for the agent", required: false },
  ],
  document_request: [{ key: "documentUrl", type: "file_url", label: "Secure document link", description: "Paste an HTTPS link from your approved file provider.", required: true }],
};

interface DbRequest {
  id: string; workspace_id: string; project_id: string; run_id: string; checkpoint_id: string | null;
  action_type: UserActionType; idempotency_key: string; title: string; description: string;
  recipient: UserActionRecipient; fields: UserActionField[]; context: Record<string, unknown>;
  identity_mode: IdentityMode; destination_url: string | null; token_hash: string; token_ciphertext: string;
  status: UserActionStatus; generation: number | string; response: Record<string, unknown> | null;
  completed_by: CompletedBy | null; completed_at: Date | string | null; expires_at: Date | string;
  resume_status: ResumeStatus; resume_job_id: string | null; delivery: StoredRequest["delivery"];
  validation: UserActionRequest["validation"]; validation_result: ResolutionValidationResult | null; resume_assessment: ResumeAssessment | null;
  requested_by: string; created_at: Date | string; updated_at: Date | string;
}

function readLocal(): LocalPlane {
  try {
    const parsed = JSON.parse(fs.readFileSync(localFile, "utf8")) as LocalPlane;
    return { requests: parsed.requests ?? [] };
  } catch {
    return { requests: [] };
  }
}

function writeLocal(data: LocalPlane): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${localFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, localFile);
}

function bounded(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

function safeKey(value: unknown): string {
  const key = bounded(value, 80).replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/^_+|_+$/g, "");
  return ["__proto__", "prototype", "constructor"].includes(key.toLowerCase()) ? "" : key;
}

function timestamp(value: Date | string | number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null) return value === null ? null : undefined;
  if (typeof value === "string") return value.slice(0, 1000);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeJson(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value !== "object") return undefined;
  const output: Record<string, unknown> = {};
  for (const [rawKey, nested] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    const key = safeKey(rawKey);
    const safe = sanitizeJson(nested, depth + 1);
    if (key && safe !== undefined) output[key] = safe;
  }
  return output;
}

function sanitizeObject(value: unknown): Record<string, unknown> {
  const safe = sanitizeJson(value);
  if (!safe || typeof safe !== "object" || Array.isArray(safe)) return {};
  const json = JSON.stringify(safe);
  if (Buffer.byteLength(json, "utf8") > 24_000) throw new TransitionError("context is too large", 400);
  return safe as Record<string, unknown>;
}

function normalizeEmail(value: unknown): string {
  const email = bounded(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new TransitionError("recipient.email must be a valid email", 400);
  return email;
}

function normalizeRecipient(value: unknown): UserActionRecipient {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TransitionError("recipient is required", 400);
  const input = value as Record<string, unknown>;
  const email = normalizeEmail(input.email);
  return { subjectId: bounded(input.subjectId, 160) || email, email, ...(bounded(input.role, 100) ? { role: bounded(input.role, 100) } : {}) };
}

function normalizeField(value: unknown, index: number): UserActionField | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const key = safeKey(input.key) || `field_${index + 1}`;
  const label = bounded(input.label, 160);
  const type = bounded(input.type, 30) as UserActionFieldType;
  if (!label || !FIELD_TYPES.has(type)) return null;
  const field: UserActionField = {
    key, type, label, required: input.required === true,
    ...(bounded(input.description, 300) ? { description: bounded(input.description, 300) } : {}),
    ...(bounded(input.placeholder, 160) ? { placeholder: bounded(input.placeholder, 160) } : {}),
  };
  if (type === "select") {
    const options = Array.isArray(input.options) ? input.options.slice(0, 30).flatMap((option) => {
      if (!option || typeof option !== "object" || Array.isArray(option)) return [];
      const source = option as Record<string, unknown>;
      const optionValue = bounded(source.value, 120);
      const optionLabel = bounded(source.label, 160);
      return optionValue && optionLabel ? [{ value: optionValue, label: optionLabel }] : [];
    }) : [];
    if (options.length < 2) throw new TransitionError(`field ${key} needs at least two options`, 400);
    field.options = options;
  }
  if (input.requiredWhen && typeof input.requiredWhen === "object" && !Array.isArray(input.requiredWhen)) {
    const condition = input.requiredWhen as Record<string, unknown>;
    const dependency = safeKey(condition.field);
    if (dependency && (typeof condition.equals === "string" || typeof condition.equals === "boolean")) {
      field.requiredWhen = { field: dependency, equals: condition.equals };
    }
  }
  return field;
}

function normalizeFields(actionType: UserActionType, value: unknown): UserActionField[] {
  const supplied = Array.isArray(value) ? value.slice(0, 20).map(normalizeField).filter((field): field is UserActionField => Boolean(field)) : [];
  const fields = supplied.length ? supplied : actionType === "structured_input" ? [] : DEFAULT_FIELDS[actionType];
  if (!fields.length) throw new TransitionError("at least one action field is required", 400);
  const keys = new Set<string>();
  for (const field of fields) {
    if (keys.has(field.key)) throw new TransitionError(`duplicate field key: ${field.key}`, 400);
    keys.add(field.key);
  }
  for (const field of fields) {
    if (field.requiredWhen && !keys.has(field.requiredWhen.field)) throw new TransitionError(`field ${field.key} has an unknown dependency`, 400);
  }
  return fields.map((field) => ({ ...field, options: field.options?.map((option) => ({ ...option })), requiredWhen: field.requiredWhen ? { ...field.requiredWhen } : undefined }));
}

function safeDestination(value: unknown): string | undefined {
  const raw = bounded(value, 1200);
  if (!raw) return undefined;
  let url: URL;
  try { url = new URL(raw); } catch { throw new TransitionError("destinationUrl must be a valid URL", 400); }
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) {
    throw new TransitionError("destinationUrl must use HTTPS", 400);
  }
  return url.toString();
}

function normalizeValidation(value: unknown): UserActionRequest["validation"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const criterion = bounded(input.criterion, 800);
  const deadRunId = bounded(input.deadRunId, 160);
  return { mode: input.mode === "claude" ? "claude" : "schema", ...(criterion ? { criterion } : {}), ...(deadRunId ? { deadRunId } : {}) };
}

function expiry(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.min(Date.now() + 30 * 864e5, Math.max(Date.now() + 5 * 60e3, value));
  const raw = bounded(value, 30) || "48h";
  const match = raw.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new TransitionError("expiresIn must look like 30m, 48h, or 7d", 400);
  const amount = Number(match[1]);
  const unit = match[2] === "m" ? 60e3 : match[2] === "h" ? 3600e3 : 864e5;
  return Date.now() + Math.min(30 * 864e5, Math.max(5 * 60e3, amount * unit));
}

function tokenFor(workspaceId: string): string {
  return `uar_${Buffer.from(workspaceId).toString("base64url")}.${crypto.randomBytes(32).toString("base64url")}`;
}

function workspaceFromToken(token: string): string | null {
  const match = token.match(/^uar_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{40,})$/);
  if (!match) return null;
  try {
    const workspaceId = Buffer.from(match[1], "base64url").toString("utf8");
    return /^ws_[a-zA-Z0-9_-]{1,120}$/.test(workspaceId) ? workspaceId : null;
  } catch { return null; }
}

function actionUrl(token: string): string {
  const pathname = `/actions/${encodeURIComponent(token)}`;
  return process.env.REVIVE_PUBLIC_URL ? `${process.env.REVIVE_PUBLIC_URL.replace(/\/$/, "")}${pathname}` : pathname;
}

function mapDb(row: DbRequest, includeUrl = false): UserActionRequest {
  const expiresAt = timestamp(row.expires_at)!;
  const request: UserActionRequest = {
    id: row.id, workspaceId: row.workspace_id, projectId: row.project_id, runId: row.run_id,
    checkpointId: row.checkpoint_id || undefined, actionType: row.action_type, idempotencyKey: row.idempotency_key,
    title: row.title, description: row.description, recipient: row.recipient, fields: row.fields,
    context: row.context || {}, identityMode: row.identity_mode, destinationUrl: row.destination_url || undefined,
    status: row.status === "pending" && expiresAt <= Date.now() ? "expired" : row.status,
    generation: Number(row.generation), response: row.response || undefined, completedBy: row.completed_by || undefined,
    completedAt: timestamp(row.completed_at), expiresAt, resumeStatus: row.resume_status,
    resumeJobId: row.resume_job_id || undefined, delivery: row.delivery || {}, requestedBy: row.requested_by,
    validation: row.validation || undefined, validationResult: row.validation_result || undefined, resumeAssessment: row.resume_assessment || undefined,
    createdAt: timestamp(row.created_at)!, updatedAt: timestamp(row.updated_at)!,
  };
  if (includeUrl) {
    const token = openJson<{ token: string }>(row.token_ciphertext, `action-request:${row.id}`).token;
    request.url = actionUrl(token);
  }
  return request;
}

function stripStored(record: StoredRequest, includeUrl = false): UserActionRequest {
  const { tokenHash: _tokenHash, tokenCiphertext, ...request } = record;
  const output: UserActionRequest = { ...request, status: request.status === "pending" && request.expiresAt <= Date.now() ? "expired" : request.status };
  if (includeUrl) output.url = actionUrl(openJson<{ token: string }>(tokenCiphertext, `action-request:${record.id}`).token);
  return output;
}

function assertIdempotentMatch(existing: UserActionRequest, input: {
  checkpointId?: string; actionType: UserActionType; title: string; recipient: UserActionRecipient; generation: number;
}): void {
  const matches = existing.actionType === input.actionType
    && existing.title === input.title
    && (existing.checkpointId || "") === (bounded(input.checkpointId, 200) || "")
    && existing.recipient.subjectId === input.recipient.subjectId
    && existing.recipient.email === input.recipient.email
    && existing.generation === input.generation;
  if (!matches) throw new TransitionError("idempotency key was already used for a different user action", 409);
}

async function defaultProject(sql: Sql, workspaceId: string, requested?: string): Promise<string> {
  if (requested) return requested;
  const rows = await sql<{ id: string }[]>`select id from revive_projects where workspace_id = ${workspaceId} order by created_at limit 1`;
  if (!rows[0]?.id) throw new TransitionError("projectId is required", 400);
  return rows[0].id;
}

export async function createUserActionRequest(workspaceId: string, input: {
  projectId?: string; runId: string; checkpointId?: string; actionType?: UserActionType; idempotencyKey: string;
  title: string; description?: string; recipient: unknown; fields?: unknown; context?: unknown;
  identityMode?: IdentityMode; destinationUrl?: string; generation?: number; expiresIn?: string; expiresAt?: number; requestedBy?: string;
  validation?: unknown;
}): Promise<UserActionRequest> {
  const actionType = ACTION_TYPES.has(input.actionType as UserActionType) ? input.actionType as UserActionType : "structured_input";
  const runId = bounded(input.runId, 200);
  const idempotencyKey = bounded(input.idempotencyKey, 200);
  const title = bounded(input.title, 180);
  if (!runId || !idempotencyKey || !title) throw new TransitionError("runId, idempotencyKey, and title are required", 400);
  const recipient = normalizeRecipient(input.recipient);
  const fields = normalizeFields(actionType, input.fields);
  const context = sanitizeObject(input.context);
  const identityMode: IdentityMode = input.identityMode === "authenticated" ? "authenticated" : "secure_link";
  const destinationUrl = safeDestination(input.destinationUrl);
  const validation = normalizeValidation(input.validation);
  const generation = Number.isInteger(input.generation) && Number(input.generation) >= 0 ? Number(input.generation) : 1;
  const expiresAt = expiry(input.expiresAt ?? input.expiresIn);
  const requestedBy = bounded(input.requestedBy, 160) || "api";
  const token = tokenFor(workspaceId);
  const tokenHash = sha256Base64Url(token);
  const id = `uar_${crypto.randomBytes(9).toString("base64url")}`;
  const tokenCiphertext = sealJson({ token }, `action-request:${id}`);
  const now = Date.now();

  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    const projectId = input.projectId || "project_default";
    const existing = data.requests.find((request) => request.workspaceId === workspaceId && request.projectId === projectId && request.runId === runId && request.idempotencyKey === idempotencyKey);
    if (existing) {
      const request = stripStored(existing, true);
      assertIdempotentMatch(request, { checkpointId: input.checkpointId, actionType, title, recipient, generation });
      return request;
    }
    const request: StoredRequest = {
      id, workspaceId, projectId, runId, checkpointId: bounded(input.checkpointId, 200) || undefined,
      actionType, idempotencyKey, title, description: bounded(input.description, 1200), recipient, fields, context,
      identityMode, destinationUrl, tokenHash, tokenCiphertext, status: "pending", generation,
      expiresAt, resumeStatus: "not_configured", delivery: {}, validation, requestedBy, createdAt: now, updatedAt: now,
    };
    data.requests.push(request); writeLocal(data); return { ...stripStored(request), url: actionUrl(token) };
  }

  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const projectId = await defaultProject(sql, workspaceId, input.projectId);
    const inserted = await sql<DbRequest[]>`
      insert into revive_action_requests
        (id, workspace_id, project_id, run_id, checkpoint_id, action_type, idempotency_key, title, description,
         recipient, fields, context, identity_mode, destination_url, token_hash, token_ciphertext, status,
         generation, expires_at, requested_by, validation)
      values
        (${id}, ${workspaceId}, ${projectId}, ${runId}, ${bounded(input.checkpointId, 200) || null}, ${actionType},
         ${idempotencyKey}, ${title}, ${bounded(input.description, 1200)}, ${sql.json(JSON.parse(JSON.stringify(recipient)))}, ${sql.json(JSON.parse(JSON.stringify(fields)))},
         ${sql.json(JSON.parse(JSON.stringify(context)))}, ${identityMode}, ${destinationUrl || null}, ${tokenHash}, ${tokenCiphertext}, 'pending',
         ${generation}, ${new Date(expiresAt)}, ${requestedBy}, ${sql.json(JSON.parse(JSON.stringify(validation || {})))})
      on conflict (workspace_id, project_id, run_id, idempotency_key) do nothing
      returning *
    `;
    if (inserted[0]) return { ...mapDb(inserted[0]), url: actionUrl(token) };
    const existing = await sql<DbRequest[]>`
      select * from revive_action_requests
      where workspace_id = ${workspaceId} and project_id = ${projectId} and run_id = ${runId} and idempotency_key = ${idempotencyKey}
    `;
    if (!existing[0]) throw new Error("action request conflict could not be resolved");
    const request = mapDb(existing[0], true);
    assertIdempotentMatch(request, { checkpointId: input.checkpointId, actionType, title, recipient, generation });
    return request;
  });
}

export async function listUserActionRequests(workspaceId: string, projectId?: string): Promise<UserActionRequest[]> {
  if (!hostedDatabaseEnabled()) return readLocal().requests.filter((request) => request.workspaceId === workspaceId && (!projectId || request.projectId === projectId)).map((request) => stripStored(request)).sort((a, b) => b.updatedAt - a.updatedAt);
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = projectId
      ? await sql<DbRequest[]>`select * from revive_action_requests where workspace_id = ${workspaceId} and project_id = ${projectId} order by updated_at desc limit 300`
      : await sql<DbRequest[]>`select * from revive_action_requests where workspace_id = ${workspaceId} order by updated_at desc limit 300`;
    return rows.map((row) => mapDb(row));
  });
}

export async function getUserActionRequest(workspaceId: string, id: string, includeUrl = false): Promise<UserActionRequest | null> {
  if (!hostedDatabaseEnabled()) {
    const record = readLocal().requests.find((request) => request.workspaceId === workspaceId && request.id === id);
    return record ? stripStored(record, includeUrl) : null;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbRequest[]>`select * from revive_action_requests where workspace_id = ${workspaceId} and id = ${id}`;
    return rows[0] ? mapDb(rows[0], includeUrl) : null;
  });
}

export async function getUserActionRequestByToken(token: string): Promise<UserActionRequest | null> {
  const workspaceId = workspaceFromToken(token);
  if (!workspaceId) return null;
  const tokenHash = sha256Base64Url(token);
  if (!hostedDatabaseEnabled()) {
    const record = readLocal().requests.find((request) => request.workspaceId === workspaceId && request.tokenHash === tokenHash);
    return record ? stripStored(record) : null;
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbRequest[]>`select * from revive_action_requests where workspace_id = ${workspaceId} and token_hash = ${tokenHash}`;
    return rows[0] ? mapDb(rows[0]) : null;
  });
}

function fieldRequired(field: UserActionField, response: Record<string, unknown>): boolean {
  return field.required || Boolean(field.requiredWhen && response[field.requiredWhen.field] === field.requiredWhen.equals);
}

function validateResponse(fields: UserActionField[], value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TransitionError("response must be an object", 400);
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = input[field.key];
    const empty = raw === undefined || raw === null || raw === "" || raw === false;
    if (empty && fieldRequired(field, input)) throw new TransitionError(`${field.label} is required`, 400);
    if (empty) continue;
    if (field.type === "boolean") {
      if (typeof raw !== "boolean") throw new TransitionError(`${field.label} must be true or false`, 400);
      output[field.key] = raw;
    } else if (field.type === "currency") {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TransitionError(`${field.label} must include currency and amount`, 400);
      const currency = bounded((raw as Record<string, unknown>).currency, 3).toUpperCase();
      const amount = Number((raw as Record<string, unknown>).amount);
      if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(amount) || Math.abs(amount) > 1e12) throw new TransitionError(`${field.label} is invalid`, 400);
      output[field.key] = { currency, amount };
    } else {
      const text = bounded(raw, field.type === "textarea" ? 4000 : 1000);
      if (field.type === "select" && !field.options?.some((option) => option.value === text)) throw new TransitionError(`${field.label} has an invalid choice`, 400);
      if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new TransitionError(`${field.label} must be an email`, 400);
      if ((field.type === "url" || field.type === "file_url") && !/^https:\/\//i.test(text)) throw new TransitionError(`${field.label} must be an HTTPS URL`, 400);
      if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new TransitionError(`${field.label} must be a date`, 400);
      output[field.key] = text;
    }
  }
  return output;
}

export function validateUserActionResponse(request: Pick<UserActionRequest, "fields">, value: unknown): Record<string, unknown> {
  return validateResponse(request.fields, value);
}

export async function completeUserActionRequest(token: string, input: { generation: number; response: unknown; authenticatedEmail?: string; validationResult?: ResolutionValidationResult }): Promise<UserActionRequest> {
  const workspaceId = workspaceFromToken(token);
  if (!workspaceId) throw new TransitionError("action link is invalid", 404);
  const tokenHash = sha256Base64Url(token);
  if (!Number.isInteger(input.generation)) throw new TransitionError("generation is required", 400);

  if (!hostedDatabaseEnabled()) {
    const data = readLocal();
    const record = data.requests.find((request) => request.workspaceId === workspaceId && request.tokenHash === tokenHash);
    if (!record) throw new TransitionError("action link is invalid", 404);
    if (record.status === "completed") return stripStored(record);
    if (record.status !== "pending") throw new TransitionError(`action request is ${record.status}`, 410);
    if (record.expiresAt <= Date.now()) { record.status = "expired"; record.updatedAt = Date.now(); writeLocal(data); throw new TransitionError("action link expired", 410); }
    if (record.generation !== input.generation) throw new TransitionError("action request belongs to a stale run generation", 409);
    const authenticatedEmail = input.authenticatedEmail?.toLowerCase();
    if (record.identityMode === "authenticated" && authenticatedEmail !== record.recipient.email) throw new TransitionError("sign in as the requested recipient", 403);
    record.response = validateResponse(record.fields, input.response);
    record.validationResult = input.validationResult;
    record.completedBy = { subjectId: record.recipient.subjectId, email: record.recipient.email, verification: record.identityMode === "authenticated" ? "authenticated_email" : "secure_link" };
    record.status = "completed"; record.completedAt = Date.now(); record.updatedAt = record.completedAt;
    writeLocal(data); return stripStored(record);
  }

  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbRequest[]>`select * from revive_action_requests where workspace_id = ${workspaceId} and token_hash = ${tokenHash} for update`;
    const row = rows[0];
    if (!row) throw new TransitionError("action link is invalid", 404);
    if (row.status === "completed") return mapDb(row);
    if (row.status !== "pending") throw new TransitionError(`action request is ${row.status}`, 410);
    if (timestamp(row.expires_at)! <= Date.now()) {
      await sql`update revive_action_requests set status = 'expired', updated_at = now() where id = ${row.id} and workspace_id = ${workspaceId}`;
      throw new TransitionError("action link expired", 410);
    }
    if (Number(row.generation) !== input.generation) throw new TransitionError("action request belongs to a stale run generation", 409);
    const authenticatedEmail = input.authenticatedEmail?.toLowerCase();
    if (row.identity_mode === "authenticated" && authenticatedEmail !== row.recipient.email) throw new TransitionError("sign in as the requested recipient", 403);
    const response = validateResponse(row.fields, input.response);
    const completedBy: CompletedBy = { subjectId: row.recipient.subjectId, email: row.recipient.email, verification: row.identity_mode === "authenticated" ? "authenticated_email" : "secure_link" };
    const updated = await sql<DbRequest[]>`
      update revive_action_requests set status = 'completed', response = ${sql.json(JSON.parse(JSON.stringify(response)))}, completed_by = ${sql.json(JSON.parse(JSON.stringify(completedBy)))},
        validation_result = ${input.validationResult ? sql.json(JSON.parse(JSON.stringify(input.validationResult))) : null},
        completed_at = now(), updated_at = now()
      where id = ${row.id} and workspace_id = ${workspaceId} and status = 'pending' and generation = ${input.generation}
      returning *
    `;
    if (!updated[0]) throw new TransitionError("action request changed before completion", 409);
    return mapDb(updated[0]);
  });
}

export async function cancelUserActionRequest(workspaceId: string, id: string): Promise<UserActionRequest> {
  if (!hostedDatabaseEnabled()) {
    const data = readLocal(); const record = data.requests.find((request) => request.workspaceId === workspaceId && request.id === id);
    if (!record) throw new TransitionError("action request not found", 404);
    if (record.status === "pending") { record.status = "cancelled"; record.updatedAt = Date.now(); writeLocal(data); }
    return stripStored(record);
  }
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<DbRequest[]>`update revive_action_requests set status = 'cancelled', updated_at = now() where workspace_id = ${workspaceId} and id = ${id} and status = 'pending' returning *`;
    if (rows[0]) return mapDb(rows[0]);
    const existing = await sql<DbRequest[]>`select * from revive_action_requests where workspace_id = ${workspaceId} and id = ${id}`;
    if (!existing[0]) throw new TransitionError("action request not found", 404);
    return mapDb(existing[0]);
  });
}

export async function markUserActionDelivery(workspaceId: string, id: string, delivery: { email?: boolean; slack?: boolean }): Promise<void> {
  if (!hostedDatabaseEnabled()) {
    const data = readLocal(); const record = data.requests.find((request) => request.workspaceId === workspaceId && request.id === id);
    if (record) { record.delivery = { ...delivery, attemptedAt: Date.now() }; record.updatedAt = Date.now(); writeLocal(data); }
    return;
  }
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`update revive_action_requests set delivery = ${sql.json({ ...delivery, attemptedAt: Date.now() })}, updated_at = now() where workspace_id = ${workspaceId} and id = ${id}`;
  });
}

export async function markUserActionResume(workspaceId: string, id: string, status: ResumeStatus, jobId?: string): Promise<void> {
  if (!hostedDatabaseEnabled()) {
    const data = readLocal(); const record = data.requests.find((request) => request.workspaceId === workspaceId && request.id === id);
    if (record) { record.resumeStatus = status; record.resumeJobId = jobId || record.resumeJobId; record.updatedAt = Date.now(); writeLocal(data); }
    return;
  }
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`update revive_action_requests set resume_status = ${status}, resume_job_id = coalesce(${jobId || null}, resume_job_id), updated_at = now() where workspace_id = ${workspaceId} and id = ${id}`;
  });
}

export async function markUserActionResumeAssessment(workspaceId: string, id: string, assessment: ResumeAssessment): Promise<void> {
  if (!hostedDatabaseEnabled()) {
    const data = readLocal(); const record = data.requests.find((request) => request.workspaceId === workspaceId && request.id === id);
    if (record) { record.resumeAssessment = assessment; record.updatedAt = Date.now(); writeLocal(data); }
    return;
  }
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`update revive_action_requests set resume_assessment = ${sql.json(JSON.parse(JSON.stringify(assessment)))}, updated_at = now() where workspace_id = ${workspaceId} and id = ${id}`;
  });
}

export function toPublicUserAction(request: UserActionRequest): PublicUserActionRequest {
  const [local, domain] = request.recipient.email.split("@");
  const recipientHint = local && domain ? `${local.slice(0, 2)}${"•".repeat(Math.min(5, Math.max(2, local.length - 2)))}@${domain}` : "the selected recipient";
  return {
    id: request.id, runId: request.runId, checkpointId: request.checkpointId, actionType: request.actionType,
    title: request.title, description: request.description, recipientHint, fields: request.fields, context: request.context,
    identityMode: request.identityMode, destinationUrl: request.destinationUrl, status: request.status,
    generation: request.generation, completedAt: request.completedAt,
    expiresAt: request.expiresAt, resumeStatus: request.resumeStatus,
    validationPassed: request.validationResult?.valid,
    resumeDecision: request.resumeAssessment?.decision,
  };
}
