-- Hosted projects complete the Postgres-backed workspace repository. Workspace
-- membership remains organization-scoped; project data is workspace-scoped.
create table if not exists revive_projects (
  id text primary key,
  workspace_id text not null references revive_workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists revive_projects_workspace on revive_projects (workspace_id, created_at);

alter table revive_projects enable row level security;
alter table revive_projects force row level security;
drop policy if exists revive_projects_tenant on revive_projects;
create policy revive_projects_tenant on revive_projects
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));

-- Credential references contain provider identity metadata and are tenant data.
-- All hosted callers now establish the workspace GUC before reading or writing.
alter table revive_connections enable row level security;
alter table revive_connections force row level security;
drop policy if exists revive_connections_tenant on revive_connections;
create policy revive_connections_tenant on revive_connections
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));
