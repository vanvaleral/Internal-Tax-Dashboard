-- Additive only. Apply after a verified backup, before enabling workflow writes.
begin;
alter table public.tax_cases add column if not exists case_workflow jsonb
  check (case_workflow is null or jsonb_typeof(case_workflow) = 'object');

create table public.tax_case_workflow_audit (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tax_cases(id) on delete restrict,
  before_state jsonb,
  after_state jsonb not null,
  actor_profile_id uuid,
  occurred_at timestamptz not null default clock_timestamp()
);
create index tax_case_workflow_audit_case_idx on public.tax_case_workflow_audit(case_id, occurred_at desc);
alter table public.tax_case_workflow_audit enable row level security;
revoke all on public.tax_case_workflow_audit from public, anon, authenticated;
revoke all on public.tax_case_workflow_audit from service_role;
grant select, insert on public.tax_case_workflow_audit to service_role;

create table public.tax_case_task_timeline (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tax_cases(id) on delete restrict,
  task_id uuid not null,
  title text not null,
  actor_profile_id uuid,
  actor_name text not null,
  event_type text not null check (event_type in ('completed', 'reopened', 'unlinked', 'linked_completed')),
  occurred_at timestamptz not null,
  unique (case_id, task_id, event_type, occurred_at)
);
create index tax_case_task_timeline_case_idx on public.tax_case_task_timeline(case_id, occurred_at desc);
alter table public.tax_case_task_timeline enable row level security;
revoke all on public.tax_case_task_timeline from public, anon, authenticated;
revoke all on public.tax_case_task_timeline from service_role;
grant select, insert on public.tax_case_task_timeline to service_role;

create function public.audit_tax_case_workflow() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.case_workflow is distinct from new.case_workflow then
    insert into public.tax_case_workflow_audit(case_id, before_state, after_state, actor_profile_id)
    values(new.id, old.case_workflow, coalesce(new.case_workflow, '{}'::jsonb), new.updated_by_profile_id);
  end if;
  return new;
end;
$$;
revoke all on function public.audit_tax_case_workflow() from public, anon, authenticated;
create trigger audit_tax_case_workflow after update of case_workflow on public.tax_cases
for each row execute function public.audit_tax_case_workflow();

create function public.capture_case_task_timeline() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_actor_name text;
  event_kind text;
  event_time timestamptz := clock_timestamp();
begin
  select coalesce(s.display_name, s.full_name, 'My Work') into v_actor_name
  from public.staff_profiles s where s.id = new.completed_by_profile_id;
  if tg_op = 'UPDATE' then
    if old.case_id is not null and old.case_id is distinct from new.case_id then
      insert into public.tax_case_task_timeline(case_id, task_id, title, actor_name, event_type, occurred_at)
      values(old.case_id, new.id, old.title, 'My Work', 'unlinked', event_time);
    end if;
    if new.case_id is not null and old.is_completed and not new.is_completed then
      -- The reopen actor is not stored on my_work_tasks; do not attribute it to the old completer.
      insert into public.tax_case_task_timeline(case_id, task_id, title, actor_name, event_type, occurred_at)
      values(new.case_id, new.id, new.title, 'My Work', 'reopened', event_time);
    end if;
    if new.case_id is null or not new.is_completed then return new; end if;
    if old.is_completed and old.case_id is not distinct from new.case_id then return new; end if;
    event_kind := case when old.is_completed then 'linked_completed' else 'completed' end;
  else
    if new.case_id is null or not new.is_completed then return new; end if;
    event_kind := 'completed';
  end if;
  insert into public.tax_case_task_timeline(case_id, task_id, title, actor_profile_id, actor_name, event_type, occurred_at)
  values(new.case_id, new.id, new.title, new.completed_by_profile_id,
    coalesce(v_actor_name,'Unknown completer'), event_kind, case when event_kind = 'completed' then coalesce(new.completed_at,event_time) else event_time end)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.capture_case_task_timeline() from public, anon, authenticated;
create trigger capture_case_task_timeline after insert or update on public.my_work_tasks
for each row execute function public.capture_case_task_timeline();

-- Snapshot existing completed links once, without generating announcements or changing tasks.
insert into public.tax_case_task_timeline(case_id, task_id, title, actor_profile_id, actor_name, event_type, occurred_at)
select t.case_id, t.id, t.title, t.completed_by_profile_id,
  coalesce(s.display_name,s.full_name,'Unknown completer'), 'completed', coalesce(t.completed_at,t.updated_at)
from public.my_work_tasks t
left join public.staff_profiles s on s.id = t.completed_by_profile_id
where t.case_id is not null and t.is_completed
on conflict do nothing;
commit;
