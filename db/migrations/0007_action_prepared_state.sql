-- 0007 — action ledger gains the "prepared" state:
-- registered but side effect not yet attempted (safe to execute on replay).
alter table revive_actions drop constraint if exists revive_actions_state_check;
alter table revive_actions add constraint revive_actions_state_check
  check (state in ('prepared','started','completed','uncertain','reconciled'));
