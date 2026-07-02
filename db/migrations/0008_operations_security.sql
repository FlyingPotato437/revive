-- Operational hardening: worker liveness, durable rate limits, retention timestamps.

alter table revive_jobs add column if not exists completed_at timestamptz;
alter table revive_jobs add column if not exists dead_at timestamptz;

create table if not exists revive_worker_heartbeats (
  worker_id text primary key,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  metadata jsonb not null default '{}'
);

create table if not exists revive_rate_limits (
  bucket_hash text not null,
  window_id bigint not null,
  hits integer not null default 1,
  expires_at timestamptz not null,
  primary key (bucket_hash, window_id)
);
create index if not exists revive_rate_limits_expiry on revive_rate_limits (expires_at);

create index if not exists revive_jobs_dead_workspace
  on revive_jobs (workspace_id, updated_at desc) where status = 'dead';
