import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

export function listWorkspaces(email: string): WorkspaceRecord[] {
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

export function selectedWorkspace(email: string, requestedId?: string): WorkspaceRecord {
  const workspaces = listWorkspaces(email);
  return workspaces.find((workspace) => workspace.id === requestedId) || workspaces[0];
}

export function createWorkspace(email: string, input: { name: string; organization: string }): WorkspaceRecord {
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

export function createProject(email: string, workspaceId: string, name: string): WorkspaceProject {
  const project: WorkspaceProject = { id: id("prj"), name: name.trim(), createdAt: Date.now() };
  if (project.name.length < 2 || project.name.length > 60) throw new Error("Project name must be 2-60 characters");
  updateWorkspace(email, workspaceId, (workspace) => workspace.projects.push(project));
  return project;
}

export function createApiKey(email: string, workspaceId: string, name: string): { key: string; record: WorkspaceApiKey } {
  const cleanName = name.trim();
  if (cleanName.length < 2 || cleanName.length > 60) throw new Error("Key name must be 2-60 characters");
  const secret = crypto.randomBytes(24).toString("base64url");
  const key = `rv_live_${secret}`;
  const record: WorkspaceApiKey = {
    id: id("key"), name: cleanName, prefix: key.slice(0, 15),
    hash: crypto.createHash("sha256").update(key).digest("hex"), createdAt: Date.now(),
  };
  updateWorkspace(email, workspaceId, (workspace) => workspace.apiKeys.push(record));
  return { key, record };
}

export function revokeApiKey(email: string, workspaceId: string, keyId: string): void {
  updateWorkspace(email, workspaceId, (workspace) => {
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
export function workspaceForApiKey(rawKey: string): WorkspaceRecord | null {
  if (!rawKey || !rawKey.startsWith("rv_")) return null;
  const digest = crypto.createHash("sha256").update(rawKey).digest();
  const data = read();
  for (const workspace of data.workspaces) {
    for (const key of workspace.apiKeys) {
      if (key.revokedAt) continue;
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
