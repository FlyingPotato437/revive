import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { authenticateHostedApiKey, ensureHostedWorkspace, hostedDatabaseEnabled, revokeHostedApiKey, saveHostedApiKey, sqlClient, withWorkspaceTransaction } from "./hosted";

export const WORKSPACE_COOKIE = "revive_workspace";

export interface WorkspaceProject {
  id: string;
  name: string;
  createdAt: number;
}

export interface WorkspaceApiKey {
  id: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  revokedAt?: number;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  organization: string;
  ownerEmail: string;
  createdAt: number;
  projects: WorkspaceProject[];
  apiKeys: WorkspaceApiKey[];
}

export type WorkspaceIdentity = Pick<WorkspaceRecord, "id" | "name" | "organization">;

interface WorkspaceFile {
  workspaces: WorkspaceRecord[];
}

const directory = process.env.REVIVE_STATE_DIR || path.join(process.cwd(), ".revive");
const file = path.join(directory, "workspaces.json");

function read(): WorkspaceFile {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as WorkspaceFile;
  } catch {
    return { workspaces: [] };
  }
}

function write(data: WorkspaceFile): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "workspace";
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function defaultWorkspace(email: string): WorkspaceRecord {
  const domain = email.split("@")[1]?.split(".")[0] || "local";
  const workspaceId = `ws_${slug(domain)}_local`;
  return {
    id: workspaceId,
    name: `${domain}-local`,
    organization: domain,
    ownerEmail: email,
    createdAt: Date.now(),
    projects: [{ id: `prj_${slug(domain)}_sandbox`, name: "Recovery sandbox", createdAt: Date.now() }],
    apiKeys: [],
  };
}

function listLocalWorkspaces(email: string): WorkspaceRecord[] {
  const normalized = email.trim().toLowerCase();
  const data = read();
  let workspaces = data.workspaces.filter((workspace) => workspace.ownerEmail === normalized);
  if (!workspaces.length) {
    const initial = defaultWorkspace(normalized);
    data.workspaces.push(initial);
    write(data);
    workspaces = [initial];
  }
  return workspaces;
}

export async function listWorkspaces(email: string): Promise<WorkspaceRecord[]> {
  const normalized = email.trim().toLowerCase();
  if (!hostedDatabaseEnabled()) return listLocalWorkspaces(normalized);
  const sql = sqlClient();
  let rows = [...await sql<{
    id: string; name: string; organization: string; owner_email: string; created_at: Date;
  }[]>`
    select workspaces.id, workspaces.name, organizations.name as organization,
      coalesce(owner_membership.user_email, ${normalized}) as owner_email,
      workspaces.created_at
    from revive_workspaces workspaces
    join revive_organizations organizations on organizations.id = workspaces.organization_id
    join revive_memberships membership on membership.organization_id = organizations.id
      and membership.user_email = ${normalized}
    left join lateral (
      select user_email from revive_memberships
      where organization_id = organizations.id and role = 'owner'
      order by created_at limit 1
    ) owner_membership on true
    order by workspaces.created_at
  `];
  if (!rows.length) {
    const initial = defaultWorkspace(normalized);
    await ensureHostedWorkspace(initial);
    await withWorkspaceTransaction(initial.id, async (tx) => {
      await tx`
        insert into revive_projects (id, workspace_id, name, created_at)
        values (${initial.projects[0].id}, ${initial.id}, ${initial.projects[0].name}, ${new Date(initial.projects[0].createdAt)})
        on conflict (id) do nothing
      `;
    });
    rows = [{ id: initial.id, name: initial.name, organization: initial.organization, owner_email: normalized, created_at: new Date(initial.createdAt) }];
  }
  return Promise.all(rows.map(async (row) => withWorkspaceTransaction(row.id, async (tx) => {
    const projects = await tx<{ id: string; name: string; created_at: Date }[]>`
      select id, name, created_at from revive_projects where workspace_id = ${row.id} order by created_at
    `;
    const keys = await tx<{
      id: string; name: string; prefix: string; hash: string; created_at: Date;
      last_used_at: Date | null; expires_at: Date | null; revoked_at: Date | null;
    }[]>`
      select id, name, prefix, hash, created_at, last_used_at, expires_at, revoked_at
      from revive_api_keys where workspace_id = ${row.id} order by created_at desc
    `;
    return {
      id: row.id,
      name: row.name,
      organization: row.organization,
      ownerEmail: row.owner_email,
      createdAt: row.created_at.getTime(),
      projects: projects.map((project) => ({ id: project.id, name: project.name, createdAt: project.created_at.getTime() })),
      apiKeys: keys.map((key) => ({
        id: key.id, name: key.name, prefix: key.prefix, hash: key.hash,
        createdAt: key.created_at.getTime(), lastUsedAt: key.last_used_at?.getTime(),
        expiresAt: key.expires_at?.getTime(), revokedAt: key.revoked_at?.getTime(),
      })),
    };
  })));
}

export async function selectedWorkspace(email: string, requestedId?: string): Promise<WorkspaceRecord> {
  const workspaces = await listWorkspaces(email);
  return workspaces.find((workspace) => workspace.id === requestedId) || workspaces[0];
}

export async function createWorkspace(email: string, input: { name: string; organization: string }): Promise<WorkspaceRecord> {
  const normalized = email.trim().toLowerCase();
  const name = input.name.trim();
  const organization = input.organization.trim();
  if (name.length < 2 || name.length > 60) throw new Error("Workspace name must be 2-60 characters");
  if (organization.length < 2 || organization.length > 80) throw new Error("Organization name must be 2-80 characters");
  const data = read();
  const workspace: WorkspaceRecord = {
    id: id("ws"), name, organization, ownerEmail: normalized, createdAt: Date.now(),
    projects: [{ id: id("prj"), name: "Recovery sandbox", createdAt: Date.now() }], apiKeys: [],
  };
  if (hostedDatabaseEnabled()) {
    await ensureHostedWorkspace(workspace);
    await withWorkspaceTransaction(workspace.id, async (tx) => {
      await tx`
        insert into revive_projects (id, workspace_id, name, created_at)
        values (${workspace.projects[0].id}, ${workspace.id}, ${workspace.projects[0].name}, ${new Date(workspace.projects[0].createdAt)})
      `;
    });
    return workspace;
  }
  data.workspaces.push(workspace);
  write(data);
  return workspace;
}

function updateWorkspace(email: string, workspaceId: string, update: (workspace: WorkspaceRecord) => void): WorkspaceRecord {
  const data = read();
  const workspace = data.workspaces.find(
    (item) => item.id === workspaceId && item.ownerEmail === email.trim().toLowerCase(),
  );
  if (!workspace) throw new Error("Workspace not found");
  update(workspace);
  write(data);
  return workspace;
}

export async function createProject(email: string, workspaceId: string, name: string): Promise<WorkspaceProject> {
  const project: WorkspaceProject = { id: id("prj"), name: name.trim(), createdAt: Date.now() };
  if (project.name.length < 2 || project.name.length > 60) throw new Error("Project name must be 2-60 characters");
  if (hostedDatabaseEnabled()) {
    await withWorkspaceTransaction(workspaceId, async (sql) => {
      await sql`
        insert into revive_projects (id, workspace_id, name, created_at)
        values (${project.id}, ${workspaceId}, ${project.name}, ${new Date(project.createdAt)})
      `;
    });
  } else {
    updateWorkspace(email, workspaceId, (workspace) => workspace.projects.push(project));
  }
  return project;
}

export async function createApiKey(
  email: string,
  workspaceId: string,
  name: string,
  options: { expiresInDays?: number } = {},
): Promise<{ key: string; record: WorkspaceApiKey }> {
  const cleanName = name.trim();
  if (cleanName.length < 2 || cleanName.length > 60) throw new Error("Key name must be 2-60 characters");
  const workspace = await selectedWorkspace(email, workspaceId);
  if (workspace.id !== workspaceId) throw new Error("Workspace not found");
  const secret = crypto.randomBytes(24).toString("base64url");
  // Hosted keys carry a non-secret workspace locator so RLS can be established
  // before the hash lookup. The secret portion remains random and is never stored.
  const key = hostedDatabaseEnabled()
    ? `rv_live_${Buffer.from(workspace.id).toString("base64url")}.${secret}`
    : `rv_live_${secret}`;
  const expiresInDays = options.expiresInDays;
  if (expiresInDays !== undefined && (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)) {
    throw new Error("API key expiration must be between 1 and 365 days");
  }
  const record: WorkspaceApiKey = {
    id: id("key"), name: cleanName, prefix: key.slice(0, 15),
    hash: crypto.createHash("sha256").update(key).digest("hex"), createdAt: Date.now(),
    expiresAt: expiresInDays ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000 : undefined,
  };
  await saveHostedApiKey({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      organization: workspace.organization,
      ownerEmail: workspace.ownerEmail,
    },
    ...record,
  });
  if (!hostedDatabaseEnabled()) updateWorkspace(email, workspaceId, (current) => current.apiKeys.push(record));
  return { key, record };
}

export async function revokeApiKey(email: string, workspaceId: string, keyId: string): Promise<void> {
  await revokeHostedApiKey(workspaceId, keyId);
  if (!hostedDatabaseEnabled()) updateWorkspace(email, workspaceId, (workspace) => {
    const key = workspace.apiKeys.find((item) => item.id === keyId);
    if (!key) throw new Error("API key not found");
    key.revokedAt = Date.now();
  });
}

export function publicWorkspace(workspace: WorkspaceRecord) {
  return {
    ...workspace,
    apiKeys: workspace.apiKeys.map(({ hash: _hash, ...key }) => key),
  };
}

/** Resolve a raw API key (Bearer rv_live_…) to its workspace. Constant-time hash compare; touches lastUsedAt. */
export async function workspaceForApiKey(rawKey: string): Promise<WorkspaceIdentity | null> {
  if (!rawKey || !rawKey.startsWith("rv_")) return null;
  if (hostedDatabaseEnabled()) return authenticateHostedApiKey(rawKey);
  const digest = crypto.createHash("sha256").update(rawKey).digest();
  const data = read();
  for (const workspace of data.workspaces) {
    for (const key of workspace.apiKeys) {
      if (key.revokedAt) continue;
      if (key.expiresAt && key.expiresAt <= Date.now()) continue;
      const stored = Buffer.from(key.hash, "hex");
      if (stored.length === digest.length && crypto.timingSafeEqual(stored, digest)) {
        key.lastUsedAt = Date.now();
        write(data);
        return workspace;
      }
    }
  }
  return null;
}
