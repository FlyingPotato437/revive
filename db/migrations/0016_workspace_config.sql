-- 0016 — per-workspace configuration (non-secret). First use: the approval
-- policy that decides which agent actions must pause for a human. Plain jsonb
-- (no encryption; nothing sensitive lives here) under the same forced RLS as
-- every other tenant table.

create table if not exists revive_workspace_config (
  workspace_id text primary key,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table revive_workspace_config enable row level security;
alter table revive_workspace_config force row level security;

drop policy if exists revive_workspace_config_tenant on revive_workspace_config;
create policy revive_workspace_config_tenant on revive_workspace_config
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));
