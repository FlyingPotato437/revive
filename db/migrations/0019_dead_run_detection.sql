-- 0019 — free dead-run detector plus AI-assisted resolution checks.

create table if not exists revive_dead_runs (
  id text primary key,
  workspace_id text not null references revive_workspaces(id) on delete cascade,
  project_id text not null references revive_projects(id) on delete cascade,
  run_id text not null,
  checkpoint_id text,
  generation bigint not null default 1,
  idempotency_key text not null,
  runtime text not null default 'custom',
  failure_message text not null,
  trace_excerpt text not null default '',
  trace_hash text not null,
  category text not null check (category in (
    'expired_oauth','missing_input','approval_needed','permission_denied',
    'browser_intervention','ambiguous_side_effect','unknown'
  )),
  confidence numeric(4,3) not null default 0,
  recoverable boolean not null default false,
  suggested_action_type text not null,
  suggested_recipient_role text not null default '',
  suggested_question text not null default '',
  classification_reason text not null default '',
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  classifier text not null default 'deterministic' check (classifier in ('deterministic','claude')),
  status text not null default 'detected' check (status in ('detected','resolution_requested','resolved','ignored')),
  action_request_id text references revive_action_requests(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (workspace_id, project_id, run_id, idempotency_key)
);

create index if not exists revive_dead_runs_workspace_created
  on revive_dead_runs (workspace_id, project_id, created_at desc);
create index if not exists revive_dead_runs_category_created
  on revive_dead_runs (workspace_id, category, created_at desc);

alter table revive_dead_runs enable row level security;
alter table revive_dead_runs force row level security;
drop policy if exists revive_dead_runs_tenant on revive_dead_runs;
create policy revive_dead_runs_tenant on revive_dead_runs
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));

alter table revive_action_requests
  add column if not exists validation jsonb not null default '{}'::jsonb,
  add column if not exists validation_result jsonb,
  add column if not exists resume_assessment jsonb;

alter table revive_action_requests drop constraint if exists revive_action_requests_resume_status_check;
alter table revive_action_requests add constraint revive_action_requests_resume_status_check
  check (resume_status in ('not_configured','queued','acknowledged','failed','held_for_review'));
