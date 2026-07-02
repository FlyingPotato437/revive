import { hostedDatabaseEnabled, sqlClient } from "./hosted";
import type { WorkspaceRecord } from "./workspaces";

export type WorkspaceRole = "viewer" | "operator" | "admin" | "owner";

const LEVEL: Record<WorkspaceRole, number> = { viewer: 0, operator: 1, admin: 2, owner: 3 };

export interface WorkspaceMember {
  email: string;
  role: WorkspaceRole;
  createdAt: string;
}

export async function workspaceRole(email: string, workspace: WorkspaceRecord): Promise<WorkspaceRole | null> {
  const normalized = email.trim().toLowerCase();
  if (hostedDatabaseEnabled()) {
    const rows = await sqlClient()<{ role: WorkspaceRole }[]>`
      select memberships.role
      from revive_memberships memberships
      join revive_workspaces workspaces on workspaces.organization_id = memberships.organization_id
      where workspaces.id = ${workspace.id} and memberships.user_email = ${normalized}
      limit 1
    `;
    if (rows[0]) return rows[0].role;
  }
  return workspace.ownerEmail === normalized ? "owner" : null;
}

export async function requireWorkspaceRole(email: string, workspace: WorkspaceRecord, minimum: WorkspaceRole): Promise<WorkspaceRole> {
  const role = await workspaceRole(email, workspace);
  if (!role || LEVEL[role] < LEVEL[minimum]) throw new Error("forbidden");
  return role;
}

export async function listWorkspaceMembers(workspace: WorkspaceRecord): Promise<WorkspaceMember[]> {
  if (!hostedDatabaseEnabled()) {
    return [{ email: workspace.ownerEmail, role: "owner", createdAt: new Date(workspace.createdAt).toISOString() }];
  }
  const rows = await sqlClient()<{ user_email: string; role: WorkspaceRole; created_at: Date }[]>`
    select memberships.user_email, memberships.role, memberships.created_at
    from revive_memberships memberships
    join revive_workspaces workspaces on workspaces.organization_id = memberships.organization_id
    where workspaces.id = ${workspace.id}
    order by case memberships.role when 'owner' then 0 when 'admin' then 1 when 'operator' then 2 else 3 end,
      memberships.user_email
  `;
  return rows.map((row) => ({ email: row.user_email, role: row.role, createdAt: row.created_at.toISOString() }));
}

export async function setWorkspaceMember(workspace: WorkspaceRecord, email: string, role: Exclude<WorkspaceRole, "owner">): Promise<void> {
  if (!hostedDatabaseEnabled()) throw new Error("hosted Postgres is required for organization memberships");
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("valid member email is required");
  await sqlClient()`
    insert into revive_memberships (organization_id, user_email, role)
    select organization_id, ${normalized}, ${role} from revive_workspaces where id = ${workspace.id}
    on conflict (organization_id, user_email) do update set role = excluded.role
  `;
}

export async function removeWorkspaceMember(workspace: WorkspaceRecord, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (normalized === workspace.ownerEmail) throw new Error("the workspace owner cannot be removed");
  if (!hostedDatabaseEnabled()) throw new Error("hosted Postgres is required for organization memberships");
  await sqlClient()`
    delete from revive_memberships memberships
    using revive_workspaces workspaces
    where workspaces.id = ${workspace.id}
      and memberships.organization_id = workspaces.organization_id
      and memberships.user_email = ${normalized}
      and memberships.role <> 'owner'
  `;
}
