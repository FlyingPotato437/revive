create table if not exists revive_credential_leases (
  lease_id text primary key,
  generation integer not null check (generation > 0),
  updated_at timestamptz not null default now()
);

create index if not exists revive_credential_leases_updated
  on revive_credential_leases (updated_at);
