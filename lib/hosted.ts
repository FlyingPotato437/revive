import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";
import { sealJson } from "./secure-envelope";

type HostedGlobal = typeof globalThis & { __reviveSql?: Sql };

export interface CredentialConnectionInput {
  id: string;
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

export async function saveCredentialConnection(input: CredentialConnectionInput): Promise<void> {
  const encrypted = sealJson(input.tokenSet, `credential:${input.id}`);
  const fingerprint = crypto.createHash("sha256").update(String(input.tokenSet.access_token || "")).digest("hex").slice(0, 16);
  if (hostedDatabaseEnabled()) {
    const sql = sqlClient();
    const metadata = JSON.parse(JSON.stringify(input.metadata || {}));
    await sql`
      insert into revive_connections
        (id, provider, account_id, scopes, encrypted_token_set, token_fingerprint, metadata, generation, status, created_at, updated_at)
      values
        (${input.id}, ${input.provider}, ${input.accountId || null}, ${input.scopes}, ${encrypted}, ${fingerprint}, ${sql.json(metadata)}, 1, 'active', now(), now())
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
  const record = { id: input.id, provider: input.provider, accountId: input.accountId, scopes: input.scopes, encryptedTokenSet: encrypted, tokenFingerprint: fingerprint, metadata: input.metadata || {}, updatedAt: Date.now() };
  records = [...records.filter((item) => item.id !== input.id), record];
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(records, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export async function enqueueJob(kind: string, payload: Record<string, unknown>, options: { id?: string; runAt?: Date; maxAttempts?: number } = {}): Promise<string | null> {
  if (!hostedDatabaseEnabled()) return null;
  const id = options.id || `job_${crypto.randomUUID()}`;
  const sql = sqlClient();
  const jsonPayload = JSON.parse(JSON.stringify(payload));
  await sql`
    insert into revive_jobs (id, kind, payload, status, attempts, max_attempts, run_at, created_at, updated_at)
    values (${id}, ${kind}, ${sql.json(jsonPayload)}, 'pending', 0, ${options.maxAttempts || 8}, ${options.runAt || new Date()}, now(), now())
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
