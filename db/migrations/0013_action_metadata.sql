-- 0013 — reconcile hints on actions. The SDK can attach provider probe fields
-- (subject / internetMessageId / messageId) at registration; recovery uses
-- them to auto-answer "did this side effect already happen?" before resume.
alter table revive_actions add column if not exists metadata jsonb;
