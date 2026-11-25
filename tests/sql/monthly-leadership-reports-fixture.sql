-- Disposable local database only.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.staff_profiles(id uuid primary key);
create table public.tax_case_progress_entries(id uuid,created_at timestamptz);
create table public.my_work_task_completion_events(id uuid,occurred_at timestamptz);
create table public.tax_case_task_timeline(id uuid,occurred_at timestamptz);
\ir ../../supabase/migrations/20261124075447_monthly_leadership_reports.sql

insert into public.staff_profiles values ('11111111-1111-4111-8111-111111111111');
set role service_role;
insert into public.monthly_leadership_reports(period,snapshot,finalized_by,finalized_by_name)
  values ('2026-09','{"cases":[]}', '11111111-1111-4111-8111-111111111111','Report Owner');
do $$ begin
  if has_table_privilege('authenticated','public.monthly_leadership_reports','SELECT')
     or has_table_privilege('service_role','public.monthly_leadership_reports','UPDATE')
     or has_table_privilege('service_role','public.monthly_leadership_reports','DELETE') then
    raise exception 'Report permissions expose or allow mutation of a snapshot';
  end if;
  begin
    insert into public.monthly_leadership_reports(period,snapshot,finalized_by,finalized_by_name)
      values ('2026-09','{"cases":[1]}', '11111111-1111-4111-8111-111111111111','Another Name');
    raise exception 'A second snapshot was accepted for the same month';
  exception when unique_violation then null; end;
end $$;
reset role;
