-- API keys are least-privilege principals. Every key belongs to one project
-- and carries a role; every action and recovery case records that project so
-- reads and mutations can enforce the boundary rather than merely label it.

-- Older workspaces may predate the hosted project repository. Give each one a
-- deterministic default project before making project_id mandatory.
alter table revive_projects no force row level security;
insert into revive_projects (id, workspace_id, name)
select 'prj_' || substr(md5(workspaces.id), 1, 12), workspaces.id, 'Default project'
from revive_workspaces workspaces
where not exists (select 1 from revive_projects projects where projects.workspace_id = workspaces.id)
on conflict (id) do nothing;

alter table revive_api_keys no force row level security;
alter table revive_actions no force row level security;
alter table revive_recovery_cases no force row level security;

alter table revive_api_keys add column if not exists project_id text references revive_projects(id);
alter table revive_api_keys add column if not exists role text not null default 'admin';
update revive_api_keys keys
set project_id = (
  select projects.id from revive_projects projects
  where projects.workspace_id = keys.workspace_id order by projects.created_at limit 1
)
where project_id is null;
alter table revive_api_keys alter column project_id set not null;
alter table revive_api_keys drop constraint if exists revive_api_keys_role_check;
alter table revive_api_keys add constraint revive_api_keys_role_check check (role in ('viewer','operator','admin'));
create index if not exists revive_api_keys_project on revive_api_keys (workspace_id, project_id);

alter table revive_actions add column if not exists project_id text references revive_projects(id);
update revive_actions actions
set project_id = (
  select projects.id from revive_projects projects
  where projects.workspace_id = actions.workspace_id order by projects.created_at limit 1
)
where project_id is null;
alter table revive_actions alter column project_id set not null;
alter table revive_actions drop constraint if exists revive_actions_workspace_id_run_id_action_key_idempotency_key_key;
alter table revive_actions drop constraint if exists revive_actions_workspace_id_run_id_action_key_idempotency_k_key;
alter table revive_actions drop constraint if exists revive_actions_project_identity_key;
alter table revive_actions add constraint revive_actions_project_identity_key
  unique (workspace_id, project_id, run_id, action_key, idempotency_key);
create index if not exists revive_actions_project_updated on revive_actions (workspace_id, project_id, updated_at desc);

alter table revive_recovery_cases add column if not exists project_id text references revive_projects(id);
update revive_recovery_cases cases
set project_id = (
  select projects.id from revive_projects projects
  where projects.workspace_id = cases.workspace_id order by projects.created_at limit 1
)
where project_id is null;
alter table revive_recovery_cases alter column project_id set not null;
drop index if exists revive_recovery_cases_open;
create unique index revive_recovery_cases_open
  on revive_recovery_cases (workspace_id, project_id, run_id, action_key)
  where state not in ('completed','rejected','expired','escalated','manual_review');
create index if not exists revive_recovery_cases_project_updated
  on revive_recovery_cases (workspace_id, project_id, updated_at desc);

alter table revive_api_keys force row level security;
alter table revive_actions force row level security;
alter table revive_recovery_cases force row level security;
alter table revive_projects force row level security;
