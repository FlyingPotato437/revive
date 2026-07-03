-- 0011: idempotent Stripe webhook processing.
create table if not exists revive_billing_events (
  id text primary key,
  workspace_id text not null references revive_workspaces(id) on delete cascade,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists revive_billing_events_workspace_at
  on revive_billing_events (workspace_id, processed_at desc);

alter table revive_billing_events enable row level security;
alter table revive_billing_events force row level security;

drop policy if exists revive_billing_events_tenant on revive_billing_events;
create policy revive_billing_events_tenant on revive_billing_events
  using (workspace_id = current_setting('revive.workspace_id', true))
  with check (workspace_id = current_setting('revive.workspace_id', true));
