-- Run only against a fresh disposable LOCAL database.
\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table public.staff_profiles(id uuid primary key, auth_user_id uuid, role text, directory_active boolean);
\ir ../../supabase/migrations/202609090001_client_master_foundation.sql
\ir ../../supabase/migrations/202609140003_client_lifecycle_and_tax_office.sql
\ir ../../supabase/migrations/202609140009_client_lifecycle_history_correction.sql
\ir ../../supabase/migrations/202609240001_proposal_contract_workflow.sql
\ir ../../supabase/migrations/20261120085536_client_master_trash.sql

create table public.fixture_case(client_id uuid references public.client_master(id) on delete restrict);
grant select, update on public.client_master to service_role;
grant select on public.staff_profiles, public.fixture_case to service_role;
grant select, insert on public.client_master_activity to service_role;
insert into auth.users values ('11111111-1111-4111-8111-111111111111');
insert into public.staff_profiles values
  ('11111111-1111-4111-8111-111111111112','11111111-1111-4111-8111-111111111111','supervisor',true),
  ('11111111-1111-4111-8111-111111111113','11111111-1111-4111-8111-111111111111','staff',true);
insert into public.client_master(id,client_code,legal_name,status,inactivated_at,updated_at,monthly_fee)
  values ('11111111-1111-4111-8111-111111111114','CL-00001','Fixture Client','Inactive','2019-01-20','2026-11-01T00:00:00Z',500);
insert into public.fixture_case select id from public.client_master;

set role service_role;
do $$
declare
  v_client uuid := '11111111-1111-4111-8111-111111111114';
  v_user uuid := '11111111-1111-4111-8111-111111111111';
  v_supervisor uuid := '11111111-1111-4111-8111-111111111112';
  v_staff uuid := '11111111-1111-4111-8111-111111111113';
  v_version timestamptz;
begin
  select updated_at into v_version from public.client_master where id = v_client;
  begin
    perform public.set_client_master_deleted(v_client,v_version,true,v_staff,v_user);
    raise exception 'Staff must not be able to delete clients';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_client_master_deleted(v_client,v_version - interval '1 second',true,v_supervisor,v_user);
    raise exception 'Stale confirmations must fail';
  exception when serialization_failure then null; end;
  perform public.set_client_master_deleted(v_client,v_version,true,v_supervisor,v_user);
  if not exists(select from public.client_master where id = v_client and status = 'Deleted' and monthly_fee = 500)
    or not exists(select from public.fixture_case where client_id = v_client) then
    raise exception 'Deletion must retain the original row, values and links';
  end if;
  begin
    update public.client_master set status = 'Active' where id = v_client;
    raise exception 'A normal save must not restore a deleted client';
  exception when check_violation then null; end;
  select updated_at into v_version from public.client_master where id = v_client;
  perform public.set_client_master_deleted(v_client,v_version,false,v_supervisor,v_user);
  if not exists(select from public.client_master where id = v_client and status = 'Inactive' and inactivated_at = '2019-01-20')
    or (select count(*) from public.client_master_activity where client_id = v_client and actor_user_id = v_user
      and action in ('client_master_deleted','client_master_restored')) <> 2 then
    raise exception 'Restoring must reinstate the old status and date and retain both audit events';
  end if;
  if has_function_privilege('authenticated','public.set_client_master_deleted(uuid,timestamptz,boolean,uuid,uuid)','EXECUTE') then
    raise exception 'Browser clients must not execute the trash RPC';
  end if;
end;
$$;
reset role;
