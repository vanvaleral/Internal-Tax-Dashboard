begin;
set local lock_timeout = '5s';

create table public.monthly_leadership_reports (
  period text primary key check (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  finalized_at timestamptz not null default now(),
  finalized_by uuid not null references public.staff_profiles(id),
  finalized_by_name text not null
);
alter table public.monthly_leadership_reports enable row level security;
revoke all on public.monthly_leadership_reports from public, anon, authenticated, service_role;
grant select, insert on public.monthly_leadership_reports to service_role;

create index monthly_leadership_followups_at on public.tax_case_progress_entries(created_at, id);
create index monthly_leadership_task_activity_at on public.my_work_task_completion_events(occurred_at, id);
create index monthly_leadership_case_activity_at on public.tax_case_task_timeline(occurred_at, id);
commit;
