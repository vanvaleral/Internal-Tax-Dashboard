-- Shared My Work tasks. Original ownership and additional assignees are stored separately.

create table if not exists public.my_work_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) > 0),
  notes text not null default '',
  steps jsonb not null default '[]'::jsonb,
  reminder_at timestamptz,
  due_date date,
  repeat_rule text not null default 'none' check (repeat_rule in ('none', 'daily', 'weekly', 'monthly', 'annually', 'custom')),
  repeat_custom_date timestamptz,
  repeat_parent_id uuid references public.my_work_tasks(id) on delete set null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_by_profile_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.my_work_task_assignees (
  task_id uuid not null references public.my_work_tasks(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, staff_profile_id)
);

create table if not exists public.my_work_task_preferences (
  task_id uuid not null references public.my_work_tasks(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  favorite boolean not null default false,
  favorited_at timestamptz,
  primary key (task_id, staff_profile_id)
);

create index if not exists idx_my_work_tasks_creator on public.my_work_tasks(created_by_profile_id, is_completed, created_at desc);
create index if not exists idx_my_work_task_assignees_staff on public.my_work_task_assignees(staff_profile_id, task_id);

create or replace function public.current_staff_profile_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select id from public.staff_profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.set_my_work_task_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists my_work_tasks_updated_at on public.my_work_tasks;
create trigger my_work_tasks_updated_at
before update on public.my_work_tasks
for each row execute function public.set_my_work_task_updated_at();

alter table public.my_work_tasks enable row level security;
alter table public.my_work_task_assignees enable row level security;
alter table public.my_work_task_preferences enable row level security;

drop policy if exists my_work_tasks_read_scope on public.my_work_tasks;
create policy my_work_tasks_read_scope on public.my_work_tasks for select to authenticated
  using (
    public.current_user_is_leadership()
    or created_by_profile_id = public.current_staff_profile_id()
    or id in (select task_id from public.my_work_task_assignees where staff_profile_id = public.current_staff_profile_id())
  );

drop policy if exists my_work_tasks_insert_self on public.my_work_tasks;
create policy my_work_tasks_insert_self on public.my_work_tasks for insert to authenticated
  with check (created_by_profile_id = public.current_staff_profile_id());

drop policy if exists my_work_tasks_update_scope on public.my_work_tasks;
create policy my_work_tasks_update_scope on public.my_work_tasks for update to authenticated
  using (
    public.current_user_is_leadership()
    or created_by_profile_id = public.current_staff_profile_id()
    or id in (select task_id from public.my_work_task_assignees where staff_profile_id = public.current_staff_profile_id())
  );

drop policy if exists my_work_assignees_read_scope on public.my_work_task_assignees;
create policy my_work_assignees_read_scope on public.my_work_task_assignees for select to authenticated
  using (task_id in (select id from public.my_work_tasks));

drop policy if exists my_work_preferences_self on public.my_work_task_preferences;
create policy my_work_preferences_self on public.my_work_task_preferences for all to authenticated
  using (staff_profile_id = public.current_staff_profile_id())
  with check (staff_profile_id = public.current_staff_profile_id());
