import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";
import { sealJson } from "./secure-envelope";

type HostedGlobal = typeof globalThis & { __reviveSql?: Sql };

export interface CredentialConnectionInput {
  id: string;
  workspaceId?: string;
  provider: string;
  accountId?: string;
  scopes: string[];
  tokenSet: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface QueueJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export function hostedDatabaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function sqlClient(): Sql {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const global = globalThis as HostedGlobal;
  if (!global.__reviveSql) {
    global.__reviveSql = postgres(process.env.DATABASE_URL, {
      max: Number(process.env.REVIVE_DB_POOL_SIZE || 5),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: process.env.REVIVE_DATABASE_SSL === "disable" ? false : "require",
    });
  }
  return global.__reviveSql;
}

/** Run tenant-owned queries with the RLS workspace context scoped to one transaction. */
export async function withWorkspaceTransaction<T>(
  workspaceId: string,
  operation: (sql: Sql) => Promise<T>,
): Promise<T> {
  if (!workspaceId) throw new Error("workspaceId is required for tenant-scoped database access");
  const result = await sqlClient().begin(async (sql) => {
    await sql`select set_config('revive.workspace_id', ${workspaceId}, true)`;
    return operation(sql);
  });
  return result as T;
}

export interface HostedWorkspaceInput {
  id: string;
  name: string;
  organization: string;
  ownerEmail: string;
}

function organizationId(name: string): string {
  return `org_${crypto.createHash("sha256").update(name.trim().toLowerCase()).digest("hex").slice(0, 24)}`;
}

/** Ensure local console identity has a corresponding hosted tenant before writes. */
export async function ensureHostedWorkspace(input: HostedWorkspaceInput): Promise<void> {
  if (!hostedDatabaseEnabled()) return;
  const sql = sqlClient();
  const orgId = organizationId(input.organization);
  await sql.begin(async (tx) => {
    await tx`
      insert into revive_organizations (id, name) values (${orgId}, ${input.organization})
      on conflict (id) do update set name = excluded.name
    `;
    await tx`
      insert into revive_workspaces (id, organization_id, name, environment)
      values (${input.id}, ${orgId}, ${input.name}, 'sandbox')
      on conflict (id) do update set name = excluded.name, organization_id = excluded.organization_id
    `;
    await tx`
      insert into revive_memberships (organization_id, user_email, role)
      values (${orgId}, ${input.ownerEmail}, 'owner')
      on conflict (organization_id, user_email) do update set role = excluded.role
    `;
  });
}

export async function saveHostedApiKey(input: {
  workspace: HostedWorkspaceInput;
  id: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: number;
  expiresAt?: number;
}): Promise<void> {
  if (!hostedDatabaseEnabled()) return;
  await ensureHostedWorkspace(input.workspace);
  await withWorkspaceTransaction(input.workspace.id, async (sql) => {
    await sql`
      insert into revive_api_keys (id, workspace_id, name, prefix, hash, created_at, expires_at)
      values (${input.id}, ${input.workspace.id}, ${input.name}, ${input.prefix}, ${input.hash},
              ${new Date(input.createdAt)}, ${input.expiresAt ? new Date(input.expiresAt) : null})
      on conflict (id) do update set
        name = excluded.name, prefix = excluded.prefix, hash = excluded.hash, expires_at = excluded.expires_at
    `;
  });
}

export async function revokeHostedApiKey(workspaceId: string, keyId: string): Promise<void> {
  if (!hostedDatabaseEnabled()) return;
  await withWorkspaceTransaction(workspaceId, async (sql) => {
    await sql`update revive_api_keys set revoked_at = now() where id = ${keyId} and workspace_id = ${workspaceId}`;
  });
}

export async function authenticateHostedApiKey(rawKey: string): Promise<{ id: string; name: string; organization: string } | null> {
  if (!hostedDatabaseEnabled()) return null;
  const encodedWorkspace = rawKey.slice("rv_live_".length).split(".", 1)[0];
  if (!encodedWorkspace || !rawKey.includes(".")) return null;
  let workspaceId: string;
  try {
    workspaceId = Buffer.from(encodedWorkspace, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!/^ws_[a-zA-Z0-9_-]{1,120}$/.test(workspaceId)) return null;
  const digest = crypto.createHash("sha256").update(rawKey).digest("hex");
  return withWorkspaceTransaction(workspaceId, async (sql) => {
    const rows = await sql<{
      workspace_id: string;
      workspace_name: string;
      organization_name: string;
    }[]>`
      update revive_api_keys as keys
         set last_used_at = now()
        from revive_workspaces as workspaces, revive_organizations as organizations
       where keys.hash = ${digest}
         and keys.workspace_id = ${workspaceId}
         and keys.revoked_at is null
         and (keys.expires_at is null or keys.expires_at > now())
         and workspaces.id = keys.workspace_id
         and organizations.id = workspaces.organization_id
      returning keys.workspace_id, workspaces.name as workspace_name, organizations.name as organization_name
    `;
    if (!rows[0]) return null;
    return { id: rows[0].workspace_id, name: rows[0].workspace_name, organization: rows[0].organization_name };
  });
}

export async function saveCredentialConnection(input: CredentialConnectionInput): Promise<void> {
  if (process.env.NODE_ENV === "production" && !input.workspaceId) {
    throw new Error("workspaceId is required for production credential connections");
  }
  const encrypted = sealJson(input.tokenSet, `credential:${input.id}`);
  const fingerprint = crypto.createHash("sha256").update(String(input.tokenSet.access_token || "")).digest("hex").slice(0, 16);
  if (hostedDatabaseEnabled()) {
    const sql = sqlClient();
    const metadata = JSON.parse(JSON.stringify(input.metadata || {}));
    await sql`
      insert into revive_connections
        (id, workspace_id, provider, account_id, scopes, encrypted_token_set, token_fingerprint, metadata, generation, status, created_at, updated_at)
      values
        (${input.id}, ${input.workspaceId || null}, ${input.provider}, ${input.accountId || null}, ${input.scopes}, ${encrypted}, ${fingerprint}, ${sql.json(metadata)}, 1, 'active', now(), now())
      on conflict (id) do update set
        account_id = excluded.account_id,
        scopes = excluded.scopes,
        encrypted_token_set = excluded.encrypted_token_set,
        token_fingerprint = excluded.token_fingerprint,
        metadata = excluded.metadata,
        generation = revive_connections.generation + 1,
        status = 'active',
        updated_at = now()
    `;
    return;
  }

  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is required to persist production credentials");
  const directory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
  const file = path.join(directory, "credential-connections.json");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  let records: Record<string, unknown>[] = [];
  try { records = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* first write */ }
  const record = { id: input.id, workspaceId: input.workspaceId, provider: input.provider, accountId: input.accountId, scopes: input.scopes, encryptedTokenSet: encrypted, tokenFingerprint: fingerprint, metadata: input.metadata || {}, updatedAt: Date.now() };
  records = [...records.filter((item) => item.id !== input.id), record];
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(records, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export interface ConnectionIdentity {
  issuer?: string;
  subject?: string;
  tenant?: string;
}

/**
 * The identity bound to a connection at creation time. Recovery compares the
 * reauthorized account against THIS binding — never trust-on-first-use during
 * recovery when the connection already exists.
 */
export async function loadConnectionIdentity(connectionId: string, workspaceId?: string): Promise<ConnectionIdentity | null> {
  if (!connectionId) return null;
  if (hostedDatabaseEnabled()) {
    const sql = sqlClient();
    const rows = await sql<{ metadata: Record<string, unknown> }[]>`
      select metadata from revive_connections
      where id = ${connectionId}
        and (${workspaceId || null}::text is null or workspace_id = ${workspaceId || null})
      limit 1
    `;
    if (!rows.length) return null;
    const metadata = rows[0].metadata || {};
    return {
      issuer: metadata.issuer as string | undefined,
      subject: metadata.providerSubject as string | undefined,
      tenant: metadata.providerTenant as string | undefined,
    };
  }
  const directory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
  try {
    const records = JSON.parse(fs.readFileSync(path.join(directory, "credential-connections.json"), "utf8")) as
      { id: string; workspaceId?: string; metadata?: Record<string, unknown> }[];
    const record = records.find((item) => item.id === connectionId && (!workspaceId || item.workspaceId === workspaceId));
    if (!record) return null;
    return {
      issuer: record.metadata?.issuer as string | undefined,
      subject: record.metadata?.providerSubject as string | undefined,
      tenant: record.metadata?.providerTenant as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function enqueueJob(kind: string, payload: Record<string, unknown>, options: { id?: string; runAt?: Date; maxAttempts?: number; workspaceId?: string } = {}): Promise<string | null> {
  if (!hostedDatabaseEnabled()) return null;
  const id = options.id || `job_${crypto.randomUUID()}`;
  const sql = sqlClient();
  const jsonPayload = JSON.parse(JSON.stringify(payload));
  await sql`
    insert into revive_jobs (id, workspace_id, kind, payload, status, attempts, max_attempts, run_at, created_at, updated_at)
    values (${id}, ${options.workspaceId || null}, ${kind}, ${sql.json(jsonPayload)}, 'pending', 0, ${options.maxAttempts || 8}, ${options.runAt || new Date()}, now(), now())
    on conflict (id) do nothing
  `;
  return id;
}

export async function claimJobs(limit = 10): Promise<QueueJob[]> {
  const sql = sqlClient();
  const rows = await sql<QueueJob[]>`
    with picked as (
      select id from revive_jobs
      where (status = 'pending' and run_at <= now())
         or (status = 'running' and locked_at < now() - interval '5 minutes')
      order by run_at, created_at
      for update skip locked
      limit ${limit}
    )
    update revive_jobs as jobs
    set status = 'running', attempts = jobs.attempts + 1, locked_at = now(), updated_at = now()
    from picked
    where jobs.id = picked.id
    returning jobs.id, jobs.kind, jobs.payload, jobs.attempts, jobs.max_attempts as "maxAttempts"
  `;
  return rows;
}

export async function completeJob(id: string): Promise<void> {
  await sqlClient()`update revive_jobs set status = 'completed', locked_at = null, updated_at = now() where id = ${id}`;
}

export async function failJob(job: QueueJob, message: string): Promise<void> {
  const terminal = job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(3600, 2 ** Math.min(job.attempts, 10) + Math.floor(Math.random() * 4));
  await sqlClient()`
    update revive_jobs
    set status = ${terminal ? "dead" : "pending"},
        last_error = ${message.slice(0, 2000)},
        run_at = case when ${terminal} then run_at else now() + (${delaySeconds} * interval '1 second') end,
        locked_at = null,
        updated_at = now()
    where id = ${job.id}
  `;
}
