-- Run only against a disposable local PostgreSQL database.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role;
create table public.staff_profiles(id integer primary key,client_permissions_updated_by integer);
create table public.staff_client_permission_audit(
  staff_profile_id integer references public.staff_profiles(id),
  actor_profile_id integer,previous_value jsonb,new_value jsonb
);
insert into public.staff_profiles values (1,null),(2,null);
grant select,update on public.staff_profiles to authenticated,service_role;
grant select,insert on public.staff_client_permission_audit to service_role;
\ir ../../supabase/migrations/20261124032551_delegated_client_oversight.sql

set role authenticated;
do $$ begin
  begin
    update public.staff_profiles set allocation_overview_allowed = true where id = 1;
    raise exception 'Browser role gained oversight without a supervisor';
  exception when insufficient_privilege then null;
  end;
  if (select allocation_overview_allowed or client_overview_allowed from public.staff_profiles where id=1) then
    raise exception 'Denied update must preserve defaults';
  end if;
end $$;
reset role;
\ir ../../supabase/migrations/20261124080527_shared_allocation_draft_editors.sql

set role authenticated;
do $$ begin
  begin
    update public.staff_profiles set allocation_draft_allowed = true where id = 1;
    raise exception 'Browser role gained shared editing without a supervisor';
  exception when insufficient_privilege then null;
  end;
  if (select allocation_draft_allowed from public.staff_profiles where id=1) then
    raise exception 'Denied update must preserve the default';
  end if;
end $$;
reset role;
set role service_role;
update public.staff_profiles set allocation_draft_allowed=true, client_permissions_updated_by=2 where id=1;
update public.staff_profiles set allocation_draft_allowed=false, client_permissions_updated_by=2 where id=1;
do $$ begin
  if (select count(*) from public.staff_client_permission_audit
      where staff_profile_id=1 and actor_profile_id=2 and new_value ? 'allocationDraft') <> 2
     or not exists (select from public.staff_client_permission_audit where previous_value->>'allocationDraft'='false' and new_value->>'allocationDraft'='true')
     or not exists (select from public.staff_client_permission_audit where previous_value->>'allocationDraft'='true' and new_value->>'allocationDraft'='false') then
    raise exception 'Shared draft grant and revoke must both be audited';
  end if;
end $$;
reset role;
set role service_role;
update public.staff_profiles set allocation_overview_allowed=true, client_permissions_updated_by=2 where id=1;
update public.staff_profiles set allocation_overview_allowed=false, client_permissions_updated_by=2 where id=1;
do $$ begin
  if (select count(*) from public.staff_client_permission_audit where staff_profile_id=1 and actor_profile_id=2
        and new_value->>'allocationOverview' is distinct from previous_value->>'allocationOverview') <> 2
     or not exists (select from public.staff_client_permission_audit where new_value->>'allocationOverview'='true')
     or not exists (select from public.staff_client_permission_audit where new_value->>'allocationOverview'='false') then
    raise exception 'The grant and revoke must both be audited';
  end if;
end $$;
reset role;
