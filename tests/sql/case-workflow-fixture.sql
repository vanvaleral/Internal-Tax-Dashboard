-- Run only in a fresh disposable LOCAL database, never in the Supabase project.
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create table public.staff_profiles(id uuid primary key, display_name text, full_name text);
create table public.tax_cases(id uuid primary key, updated_by_profile_id uuid, stage text);
create table public.my_work_tasks(id uuid primary key, case_id uuid references public.tax_cases(id), title text,
  is_completed boolean, completed_at timestamptz, completed_by_profile_id uuid, created_by_profile_id uuid, updated_at timestamptz default now());
grant all on public.staff_profiles, public.tax_cases, public.my_work_tasks to service_role;
insert into public.staff_profiles values('00000000-0000-4000-8000-000000000001','Synthetic Tax','Synthetic Tax');
insert into public.tax_cases values('00000000-0000-4000-8000-000000000010',null,'Working'),('00000000-0000-4000-8000-000000000020',null,'Working');
insert into public.my_work_tasks values('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010','Historical completed work',true,'2026-11-01','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',now());
\ir ../../supabase/migrations/20261105055510_case_workflow_and_task_timeline.sql
do $$ begin
  if (select count(*) from public.tax_case_task_timeline) <> 1 then raise exception 'Missing historical snapshot'; end if;
  if exists(select 1 from public.tax_cases where stage <> 'Working' or case_workflow is not null) then raise exception 'Migration rewrote existing case'; end if;
  if has_table_privilege('anon','public.tax_case_task_timeline','SELECT')
    or has_table_privilege('authenticated','public.tax_case_task_timeline','INSERT')
    or has_table_privilege('service_role','public.tax_case_task_timeline','UPDATE')
    or has_table_privilege('service_role','public.tax_case_workflow_audit','DELETE') then raise exception 'Unexpected history grant'; end if;
  if has_function_privilege('anon','public.capture_case_task_timeline()','EXECUTE') then raise exception 'Public trigger function'; end if;
end $$;
set role service_role;
-- A title edit must not generate another completion.
update public.my_work_tasks set title='Later title' where id='00000000-0000-4000-8000-000000000100';
update public.my_work_tasks set is_completed=false,completed_at=null,completed_by_profile_id=null where id='00000000-0000-4000-8000-000000000100';
update public.my_work_tasks set is_completed=true,completed_at='2026-11-05',completed_by_profile_id='00000000-0000-4000-8000-000000000001' where id='00000000-0000-4000-8000-000000000100';
update public.my_work_tasks set case_id='00000000-0000-4000-8000-000000000020' where id='00000000-0000-4000-8000-000000000100';
update public.tax_cases set case_workflow='{"result":{"number":"BA-TEST"}}',updated_by_profile_id='00000000-0000-4000-8000-000000000001' where id='00000000-0000-4000-8000-000000000010';
reset role;
do $$ begin
  if (select count(*) from public.tax_case_task_timeline where event_type='completed') <> 2 then raise exception 'Completion cycle lost or duplicated'; end if;
  if (select count(*) from public.tax_case_task_timeline where event_type='reopened') <> 1 then raise exception 'Reopen missing'; end if;
  if (select count(*) from public.tax_case_task_timeline where event_type='unlinked') <> 1 then raise exception 'Original case lost relink history'; end if;
  if (select count(*) from public.tax_case_task_timeline where event_type='linked_completed') <> 1 then raise exception 'New case missing completed link'; end if;
  if not exists(select 1 from public.tax_case_task_timeline where title='Historical completed work') then raise exception 'Historical task title was overwritten'; end if;
  if (select count(*) from public.tax_case_workflow_audit) <> 1 then raise exception 'Workflow audit missing'; end if;
  begin
    update public.my_work_tasks set case_id='00000000-0000-4000-8000-000000000010' where id='00000000-0000-4000-8000-000000000100';
    raise exception 'rollback fixture' using errcode='P0099';
  exception when sqlstate 'P0099' then null;
  end;
  if (select count(*) from public.tax_case_task_timeline) <> 5 then raise exception 'Trigger event did not roll back with task write'; end if;
end $$;
insert into public.my_work_tasks values('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000010','Unknown legacy completer',true,'2026-11-05',null,'00000000-0000-4000-8000-000000000001',now());
do $$ begin
  if not exists(select 1 from public.tax_case_task_timeline where task_id='00000000-0000-4000-8000-000000000200' and actor_profile_id is null and actor_name='Unknown completer') then raise exception 'Creator was misrepresented as completer'; end if;
end $$;
select 'PASS: additive migration, retained task history, atomic triggers, audit, restricted grants and honest attribution' as result;
