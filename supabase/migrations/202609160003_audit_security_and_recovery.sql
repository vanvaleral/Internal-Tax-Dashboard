-- Additive remediation for audit F04, F09, F10. Back up before deployment.
begin;

create or replace function public.active_staff_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_profiles
    where auth_user_id = auth.uid() and directory_active = true);
$$;
revoke all on function public.active_staff_session() from public, anon;
grant execute on function public.active_staff_session() to authenticated, service_role;

-- Restrictive policies supplement (never broaden) existing row scopes.
do $$
declare item record;
begin
  for item in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists active_staff_required on public.%I', item.relname);
    execute format('create policy active_staff_required on public.%I as restrictive for all to authenticated using (public.active_staff_session()) with check (public.active_staff_session())', item.relname);
  end loop;
end $$;

create or replace function public.protect_staff_access_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.role() = 'authenticated' and (
    new.directory_active is distinct from old.directory_active
    or new.role is distinct from old.role
    or new.auth_user_id is distinct from old.auth_user_id
    or new.team_division is distinct from old.team_division
    or new.claim_code_hash is distinct from old.claim_code_hash
  ) then raise exception 'Staff access changes require the authorized management API.'; end if;
  return new;
end;
$$;
revoke all on function public.protect_staff_access_columns() from public, anon, authenticated;
drop trigger if exists staff_access_columns_protected on public.staff_profiles;
create trigger staff_access_columns_protected before update on public.staff_profiles
  for each row execute function public.protect_staff_access_columns();

alter table public.my_work_tasks add column if not exists client_request_id text;
create unique index if not exists my_work_tasks_creation_request_idx
  on public.my_work_tasks(created_by_profile_id, client_request_id) where client_request_id is not null;

create or replace function public.purge_deleted_items()
returns void language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz := now() - interval '3 days';
begin
  -- Lock the tombstones so restoration cannot race with expiration.
  with expired as materialized (
    select announcement_id, staff_profile_id from public.announcement_recipient_trash
    where deleted_at < cutoff for update
  ), removed_recipients as (
    delete from public.announcement_recipients r using expired e
    where r.announcement_id = e.announcement_id and r.staff_profile_id = e.staff_profile_id
    returning r.announcement_id
  )
  delete from public.announcement_recipient_trash t using expired e
    where t.announcement_id = e.announcement_id and t.staff_profile_id = e.staff_profile_id;
  delete from public.tax_cases where deleted_at < cutoff;
  delete from public.client_master_duplicate_trash where deleted_at < cutoff;
end;
$$;
revoke all on function public.purge_deleted_items() from public, anon, authenticated;
grant execute on function public.purge_deleted_items() to service_role;

commit;
