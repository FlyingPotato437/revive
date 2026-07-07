-- Workspace-defined Nango identity connectors. These definitions contain no
-- provider credentials; they describe the authenticated identity probe Revive
-- runs through Nango's proxy when binding and recovering a connection.
create table if not exists revive_custom_connectors (
  workspace_id text not null references revive_workspaces(id) on delete cascade,
  integration_id text not null,
  label text not null,
  probe_path text not null,
  subject_field text not null,
  tenant_field text not null,
  account_field text not null,
  provisional boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, integration_id),
  check (integration_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  check (probe_path ~ '^/[^/]'),
  check (length(label) between 2 and 80),
  check (length(subject_field) between 1 and 200),
  check (length(tenant_field) between 1 and 200),
  check (length(account_field) between 1 and 200)
);

alter table revive_custom_connectors enable row level security;
alter table revive_custom_connectors force row level security;
drop policy if exists revive_custom_connectors_tenant on revive_custom_connectors;
create policy revive_custom_connectors_tenant on revive_custom_connectors
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));

