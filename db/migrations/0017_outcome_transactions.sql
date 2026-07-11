-- 0017 — task-scoped outcome contracts and multi-action transactions.
-- Actions remain the exactly-once execution primitive. Transactions group
-- those actions into one business outcome with verification and compensation
-- state, so a partially completed workflow cannot silently report success.

create table if not exists revive_outcome_contracts (
  id text primary key,
  workspace_id text not null references revive_workspaces(id) on delete cascade,
  project_id text not null references revive_projects(id) on delete cascade,
  contract_key text not null,
  name text not null,
  description text not null default '',
  version integer not null default 1,
  status text not null default 'active' check (status in ('draft','active','archived')),
  approval_mode text not null default 'policy' check (approval_mode in ('never','policy','always')),
  preconditions jsonb not null default '[]'::jsonb,
  required_outcomes jsonb not null default '[]'::jsonb,
  compensation jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, project_id, contract_key, version)
);

create index if not exists revive_outcome_contracts_lookup
  on revive_outcome_contracts (workspace_id, project_id, contract_key, status, version desc);

create table if not exists revive_transactions (
  id text primary key,
  workspace_id text not null references revive_workspaces(id) on delete cascade,
  project_id text not null references revive_projects(id) on delete cascade,
  run_id text not null,
  contract_id text references revive_outcome_contracts(id),
  contract_key text not null,
  idempotency_key text not null,
  title text not null,
  state text not null default 'planned' check (state in (
    'planned','awaiting_approval','executing','verifying','verified',
    'recovering','compensated','needs_human','cancelled'
  )),
  version bigint not null default 1,
  approval jsonb,
  trace_context jsonb,
  input_ref text,
  result_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (workspace_id, project_id, contract_key, idempotency_key)
);

create index if not exists revive_transactions_workspace_updated
  on revive_transactions (workspace_id, project_id, updated_at desc);
create index if not exists revive_transactions_attention
  on revive_transactions (workspace_id, state, updated_at desc)
  where state in ('awaiting_approval','recovering','needs_human');

create table if not exists revive_transaction_steps (
  id text primary key,
  workspace_id text not null references revive_workspaces(id) on delete cascade,
  project_id text not null references revive_projects(id) on delete cascade,
  transaction_id text not null references revive_transactions(id) on delete cascade,
  step_key text not null,
  position integer not null,
  action_id text references revive_actions(id),
  action_key text not null,
  connection_id text not null,
  state text not null default 'planned' check (state in (
    'planned','executing','succeeded','verifying','verified','unknown',
    'failed','compensating','compensated','skipped'
  )),
  version bigint not null default 1,
  expected_outcome jsonb,
  evidence jsonb,
  remote_id text,
  reversible boolean not null default false,
  compensation_action_key text,
  note text,
  started_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, step_key)
);

create index if not exists revive_transaction_steps_order
  on revive_transaction_steps (transaction_id, position);

alter table revive_outcome_contracts enable row level security;
alter table revive_outcome_contracts force row level security;
alter table revive_transactions enable row level security;
alter table revive_transactions force row level security;
alter table revive_transaction_steps enable row level security;
alter table revive_transaction_steps force row level security;

drop policy if exists revive_outcome_contracts_tenant on revive_outcome_contracts;
create policy revive_outcome_contracts_tenant on revive_outcome_contracts
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));

drop policy if exists revive_transactions_tenant on revive_transactions;
create policy revive_transactions_tenant on revive_transactions
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));

drop policy if exists revive_transaction_steps_tenant on revive_transaction_steps;
create policy revive_transaction_steps_tenant on revive_transaction_steps
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));
