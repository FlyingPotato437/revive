-- 0003_tenancy.sql
-- Multi-tenant ownership for every operational table, plus the hosted
-- control-plane tables (recovery cases + action ledger) and append-only audit.
--
-- RLS note: policies below are default-deny once RLS is enabled, but table
-- OWNERS and superusers BYPASS RLS unless the role is created with NOBYPASSRLS
-- and the app connects as a non-owner role. Deploy with:
--   * an app role that does NOT own these tables,
--   * SET LOCAL revive.workspace_id = '<tenant>' per transaction,
--   * FORCE ROW LEVEL SECURITY on each table (below) so even the owner obeys.

-- --- identity ---------------------------------------------------------------

create table if not exists revive_organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists revive_workspaces (
  id text primary key,
  organization_id text not null references revive_organizations(id),
  name text not null,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'staging', 'production')),
  created_at timestamptz not null default now(),
  unique (organization_id, name, environment)
);

create table if not exists revive_memberships (
  organization_id text not null references revive_organizations(id),
  user_email text not null,
  role text not null check (role in ('owner', 'admin', 'operator', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_email)
);

create table if not exists revive_api_keys (
  id text primary key,
  workspace_id text not null references revive_workspaces(id),
  name text not null,
  prefix text not null,
  hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
create index if not exists revive_api_keys_workspace on revive_api_keys (workspace_id);

-- --- control plane -----------------------------------------------------------

create table if not exists revive_recovery_cases (
  id text primary key,
  workspace_id text not null references revive_workspaces(id),
  run_id text not null,
  checkpoint_id text,
  connection_id text not null,
  action_key text not null,
  idempotency_key text not null,
  provider text,
  policy text not null check (policy in ('interactive_reauth', 'step_up', 'retry', 'manual_reconcile')),
  reason text not null,
  state text not null default 'detected' check (state in (
    'detected','classified','parked','awaiting_authorization','identity_verified',
    'resumed','reconciled','completed','rejected','expired','escalated','manual_review')),
  version bigint not null default 1,
  lease_generation integer,
  url text,
  events jsonb not null default '[]',
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
-- one open case per (workspace, run, action)
create unique index if not exists revive_recovery_cases_open
  on revive_recovery_cases (workspace_id, run_id, action_key)
  where state not in ('completed','rejected','expired','escalated','manual_review');

create table if not exists revive_actions (
  id text primary key,
  workspace_id text not null references revive_workspaces(id),
  run_id text not null,
  checkpoint_id text,
  connection_id text not null,
  action_key text not null,
  idempotency_key text not null,
  state text not null default 'started' check (state in ('started','completed','uncertain','reconciled')),
  version bigint not null default 1,
  attempts integer not null default 1,
  remote_id text,
  note text,
  result_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, run_id, action_key, idempotency_key)
);

-- --- tenancy columns on existing operational tables ---------------------------

alter table revive_sessions add column if not exists workspace_id text;
alter table revive_connections add column if not exists workspace_id text;
alter table revive_jobs add column if not exists workspace_id text;
alter table revive_webhook_deliveries add column if not exists workspace_id text;
create index if not exists revive_sessions_workspace on revive_sessions (workspace_id);
create index if not exists revive_connections_workspace on revive_connections (workspace_id);

-- --- append-only audit ---------------------------------------------------------

create table if not exists revive_audit_events (
  id bigint generated always as identity primary key,
  workspace_id text not null,
  actor text not null,            -- api key prefix, user email, or 'system'
  subject_kind text not null,     -- 'case' | 'action' | 'connection' | 'key' | 'auth'
  subject_id text not null,
  event text not null,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists revive_audit_workspace_at on revive_audit_events (workspace_id, at desc);

-- Append-only: revoke row mutation outright; only inserts are allowed.
revoke update, delete, truncate on revive_audit_events from public;

-- --- row-level security ---------------------------------------------------------

-- Forced, default-deny RLS on the tables the control-plane repository owns.
-- App sets per transaction:  SELECT set_config('revive.workspace_id', $1, true);
--
-- Deliberately NOT forced here:
--   * revive_jobs / revive_webhook_deliveries — the queue worker claims across
--     tenants; it must run as a dedicated restricted role (no table ownership,
--     NOBYPASSRLS) with its own claim function, not through tenant policies.
--   * revive_sessions / revive_connections — legacy writers do not yet set the
--     tenant GUC; enabling forced RLS there before the Postgres repository
--     lands would break connection persistence. Tracked in ENGINEERING-GAPS.md.
do $$
declare t text;
begin
  foreach t in array array[
    'revive_recovery_cases','revive_actions','revive_api_keys','revive_audit_events'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    -- drop-if-exists keeps the migration idempotent
    execute format('drop policy if exists %I_tenant on %I', t, t);
    execute format(
      'create policy %I_tenant on %I using (workspace_id = current_setting(''revive.workspace_id'', true)) with check (workspace_id = current_setting(''revive.workspace_id'', true))',
      t, t);
  end loop;
end $$;
