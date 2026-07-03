-- 0008: per-workspace secret configuration (e.g. BYO Nango project key).
-- Values are envelope-encrypted with REVIVE_SECRET / KMS keys before insert.
create table if not exists revive_workspace_secrets (
  workspace_id text not null,
  name text not null,
  encrypted_value text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, name)
);

alter table revive_workspace_secrets enable row level security;
alter table revive_workspace_secrets force row level security;
drop policy if exists revive_workspace_secrets_tenant on revive_workspace_secrets;
create policy revive_workspace_secrets_tenant on revive_workspace_secrets
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));
