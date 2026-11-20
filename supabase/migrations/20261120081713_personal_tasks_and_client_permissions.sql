alter table public.my_work_tasks
  add column deleted_at timestamptz,
  add column deleted_by_profile_id uuid references public.staff_profiles(id);

-- Task access goes through the application API. Case history and reminder
-- processing continue to use the existing server-side access paths.
revoke all on public.my_work_tasks, public.my_work_task_assignees,
  public.my_work_task_preferences, public.my_work_task_completion_events from public, anon, authenticated;
grant select, insert, update on public.my_work_tasks, public.my_work_task_assignees,
  public.my_work_task_preferences to service_role;
grant select, insert on public.my_work_task_completion_events to service_role;

alter table public.staff_profiles add column client_import_allowed boolean,
  add column client_export_allowed boolean,
  add column client_permissions_updated_by uuid references public.staff_profiles(id);

create table public.staff_client_permission_audit (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id),
  actor_profile_id uuid references public.staff_profiles(id),
  previous_value jsonb not null,
  new_value jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.staff_client_permission_audit enable row level security;
revoke all on public.staff_client_permission_audit from public, anon, authenticated;
grant select, insert on public.staff_client_permission_audit to service_role;

create function public.guard_staff_client_permissions() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') and
      (new.client_import_allowed is not null or new.client_export_allowed is not null or new.client_permissions_updated_by is not null) then
      raise insufficient_privilege using message = 'Client permissions are managed by a supervisor.';
    end if;
    return new;
  end if;
  if row(new.client_import_allowed, new.client_export_allowed, new.client_permissions_updated_by)
    is distinct from row(old.client_import_allowed, old.client_export_allowed, old.client_permissions_updated_by) then
    if current_user in ('authenticated', 'anon') then
      raise insufficient_privilege using message = 'Client permissions are managed by a supervisor.';
    end if;
  end if;
  if row(new.client_import_allowed, new.client_export_allowed)
    is distinct from row(old.client_import_allowed, old.client_export_allowed) then
    insert into public.staff_client_permission_audit(staff_profile_id, actor_profile_id, previous_value, new_value)
    values(new.id, new.client_permissions_updated_by,
      jsonb_build_object('import', old.client_import_allowed, 'export', old.client_export_allowed),
      jsonb_build_object('import', new.client_import_allowed, 'export', new.client_export_allowed));
  end if;
  return new;
end;
$$;
revoke all on function public.guard_staff_client_permissions() from public, anon, authenticated;
create trigger staff_client_permissions_guard before insert or update on public.staff_profiles
  for each row execute function public.guard_staff_client_permissions();
