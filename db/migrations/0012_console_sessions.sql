-- 0011 — durable sandbox console sessions + recovery tickets.
-- The Playground runs in-memory per process; on serverless the reauthorization
-- link may land on a different instance than the one that created the ticket,
-- so the session + ticket mapping must be shared.
create table if not exists revive_console_sessions (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists revive_console_tickets (
  ticket_id text primary key,
  session_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists revive_console_sessions_updated on revive_console_sessions (updated_at);
