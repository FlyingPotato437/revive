-- 0010: billing state on organizations (Stripe subscription mapping).
alter table revive_organizations add column if not exists plan text not null default 'free';
alter table revive_organizations add column if not exists stripe_customer_id text;
alter table revive_organizations add column if not exists stripe_subscription_id text;
alter table revive_organizations add column if not exists plan_updated_at timestamptz;
create unique index if not exists revive_orgs_stripe_customer on revive_organizations (stripe_customer_id) where stripe_customer_id is not null;
