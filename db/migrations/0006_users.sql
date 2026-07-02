-- 0004_users.sql — durable console accounts (hosted deployments).
create table if not exists revive_users (
  email text primary key,
  name text not null,
  salt text not null,
  hash text not null,
  created_at timestamptz not null default now()
);
