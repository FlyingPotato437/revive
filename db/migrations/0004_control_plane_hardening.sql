-- Safe to apply after earlier versions of 0003_tenancy.sql.
alter table revive_actions add column if not exists result_ref text;
