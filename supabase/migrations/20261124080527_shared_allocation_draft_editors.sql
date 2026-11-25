begin;
set local lock_timeout = '5s';

alter table public.staff_profiles add column allocation_draft_allowed boolean not null default false;

create or replace function public.guard_staff_oversight_permissions()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  changed boolean;
begin
  if tg_op = 'INSERT' then
    changed := new.client_overview_allowed or new.allocation_overview_allowed or new.allocation_draft_allowed;
  else
    changed := (new.client_overview_allowed,new.allocation_overview_allowed,new.allocation_draft_allowed)
      is distinct from (old.client_overview_allowed,old.allocation_overview_allowed,old.allocation_draft_allowed);
  end if;
  if not changed then return new; end if;
  if current_user in ('authenticated','anon') then
    raise insufficient_privilege using message = 'Individual permissions are managed by a supervisor.';
  end if;
  insert into public.staff_client_permission_audit(staff_profile_id,actor_profile_id,previous_value,new_value)
    values(new.id,new.client_permissions_updated_by,
      case when tg_op = 'UPDATE' then jsonb_build_object('clientOverview',old.client_overview_allowed,
        'allocationOverview',old.allocation_overview_allowed,'allocationDraft',old.allocation_draft_allowed) else '{}'::jsonb end,
      jsonb_build_object('clientOverview',new.client_overview_allowed,
        'allocationOverview',new.allocation_overview_allowed,'allocationDraft',new.allocation_draft_allowed));
  return new;
end;
$$;
revoke all on function public.guard_staff_oversight_permissions() from public, anon, authenticated;
commit;
