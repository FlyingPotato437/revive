-- 0018 — secure user-action requests and replay-safe continuation.
-- A request is the durable bridge between a suspended agent run and the
-- specific person who can unblock it. Raw bearer tokens are never stored.

create table if not exists revive_action_requests (
  id text primary key,
  workspace_id text not null references revive_workspaces(id) on delete cascade,
  project_id text not null references revive_projects(id) on delete cascade,
  run_id text not null,
  checkpoint_id text,
  action_type text not null check (action_type in (
    'approval','structured_input','clarification','reauthorization',
    'verification','permission','browser_handoff','document_request'
  )),
  idempotency_key text not null,
  title text not null,
  description text not null default '',
  recipient jsonb not null,
  fields jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  identity_mode text not null default 'secure_link' check (identity_mode in ('secure_link','authenticated')),
  destination_url text,
  token_hash text not null unique,
  token_ciphertext text not null,
  status text not null default 'pending' check (status in ('pending','completed','cancelled','expired')),
  generation bigint not null default 1,
  response jsonb,
  completed_by jsonb,
  completed_at timestamptz,
  expires_at timestamptz not null,
  resume_status text not null default 'not_configured' check (resume_status in ('not_configured','queued','acknowledged','failed')),
  resume_job_id text,
  delivery jsonb not null default '{}'::jsonb,
  requested_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, project_id, run_id, idempotency_key)
);

create index if not exists revive_action_requests_workspace_updated
  on revive_action_requests (workspace_id, project_id, updated_at desc);
create index if not exists revive_action_requests_pending
  on revive_action_requests (workspace_id, expires_at, created_at)
  where status = 'pending';

alter table revive_action_requests enable row level security;
alter table revive_action_requests force row level security;

drop policy if exists revive_action_requests_tenant on revive_action_requests;
create policy revive_action_requests_tenant on revive_action_requests
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));
