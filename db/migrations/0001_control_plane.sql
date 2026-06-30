create table if not exists revive_sessions (
  id text primary key,
  state jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists revive_connections (
  id text primary key,
  provider text not null,
  account_id text,
  scopes text[] not null default '{}',
  encrypted_token_set text not null,
  token_fingerprint text not null,
  metadata jsonb not null default '{}',
  generation integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists revive_jobs (
  id text primary key,
  kind text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists revive_jobs_ready on revive_jobs (run_at, created_at) where status = 'pending';

create table if not exists revive_webhook_deliveries (
  id text primary key,
  event_type text not null,
  endpoint text not null,
  payload jsonb not null,
  response_status integer,
  response_body text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists revive_checkpoints (
  run_id text primary key,
  step_index integer not null,
  step_id text not null,
  cursor jsonb not null,
  token_fingerprint text not null,
  scopes jsonb not null,
  status text not null,
  taken_at double precision not null
);

create table if not exists revive_rendezvous (
  id text primary key,
  run_id text unique not null,
  kind text not null,
  prompt text not null,
  url text not null,
  context jsonb not null,
  status text not null,
  reply jsonb,
  created_at double precision not null,
  expires_at double precision not null
);

create table if not exists revive_action_attempts (
  action_id text primary key,
  run_id text not null,
  step_id text not null,
  state text not null,
  attempts integer not null,
  updated_at double precision not null
);
