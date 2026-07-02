-- 0005_leases.sql — hosted credential-lease fencing registry.
create table if not exists revive_leases (
  workspace_id text not null,
  connection_id text not null,
  generation integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, connection_id)
);

alter table revive_leases enable row level security;
alter table revive_leases force row level security;
drop policy if exists revive_leases_tenant on revive_leases;
create policy revive_leases_tenant on revive_leases
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));
