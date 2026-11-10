-- Fresh disposable LOCAL PostgreSQL only. This creates synthetic schema/data, never production data.
\set ON_ERROR_STOP on
\ir case-workflow-fixture.sql
alter table public.staff_profiles
  add column directory_active boolean default true,
  add column auth_user_id uuid default gen_random_uuid(),
  add column role text default 'supervisor';
alter table public.tax_cases add column deleted_at timestamptz;
alter table public.my_work_tasks
  add column steps jsonb default '[]'::jsonb,
  add column notes text,
  alter column is_completed set default false;
insert into public.my_work_tasks(id,case_id,title,created_by_profile_id,steps) values(
  '00000000-0000-4000-8000-000000000300','00000000-0000-4000-8000-000000000010','Legacy checked steps',
  '00000000-0000-4000-8000-000000000001','[{"title":"Historical worksheet","done":true},{"title":"Earlier meeting","done":true},{"title":"Pending review","done":false}]');
create temporary table subtask_source_before as select id,title,steps,is_completed from public.my_work_tasks;
\ir ../../supabase/migrations/20261110080458_case_subtask_timeline.sql
do $$ begin
  assert (select count(*) = 2 from public.tax_case_task_timeline where task_id = '00000000-0000-4000-8000-000000000300'
    and event_type = 'step_snapshot' and occurred_at is null and actor_profile_id is null), 'legacy checkmarks must be undated and unattributed';
  assert not exists(select 1 from subtask_source_before b full join public.my_work_tasks t using(id)
    where b.title is distinct from t.title or b.steps is distinct from t.steps or b.is_completed is distinct from t.is_completed), 'migration must preserve original tasks';
end $$;
\ir ../my-work-subtask-timeline.sql
