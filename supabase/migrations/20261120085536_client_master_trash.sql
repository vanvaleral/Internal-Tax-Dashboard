begin;

set local lock_timeout = '5s';

alter table public.client_master drop constraint client_master_status_check;
alter table public.client_master add constraint client_master_status_check
  check (status in ('Active', 'Inactive', 'Proposal', 'Contract', 'Deleted'));

-- Deleted records still reserve their identity and retain all foreign keys.
-- Prevent normal saves, imports, allocation and duplicate cleanup from changing them.
create function public.guard_deleted_client_master()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'Deleted' then
      raise exception using errcode = '23514', message = 'Restore this client from Deleted Clients before merging it.';
    end if;
    return old;
  end if;
  if (new.status = 'Deleted' or (tg_op = 'UPDATE' and old.status = 'Deleted'))
    and current_setting('app.client_trash_transition', true) is distinct from new.id::text then
    raise exception using errcode = '23514', message = 'Use Deleted Clients to restore this record before updating it.';
  end if;
  return new;
end;
$$;
create trigger guard_deleted_client_master before insert or update or delete on public.client_master
  for each row execute function public.guard_deleted_client_master();
revoke all on function public.guard_deleted_client_master() from public, anon, authenticated;

create function public.set_client_master_deleted(
  p_client_id uuid, p_expected_updated_at timestamptz, p_deleted boolean,
  p_actor_profile_id uuid, p_actor_user_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_client public.client_master%rowtype;
  v_prior jsonb;
  v_status text;
begin
  if not exists (
    select from public.staff_profiles where id = p_actor_profile_id and auth_user_id = p_actor_user_id
      and directory_active and role::text in ('supervisor','partner','admin')
  ) then
    raise exception using errcode = '42501', message = 'Only a Supervisor, Partner or Admin can delete or restore clients.';
  end if;
  select * into v_client from public.client_master where id = p_client_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'This client could not be found.';
  end if;
  if v_client.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'This client changed in another session. Refresh the list and try again.';
  end if;
  if p_deleted and v_client.status in ('Active','Inactive') then
    v_status := 'Deleted';
    v_prior := jsonb_build_object('status',v_client.status,'inactivated_at',v_client.inactivated_at);
  elsif p_deleted is false and v_client.status = 'Deleted' then
    select previous_value into v_prior from public.client_master_activity
      where client_id = p_client_id and action = 'client_master_deleted'
      order by created_at desc, id desc limit 1;
    v_status := v_prior->>'status';
    if v_status is null or v_status not in ('Active','Inactive') then
      raise exception using errcode = '40001', message = 'The original client status could not be confirmed.';
    end if;
  else
    raise exception using errcode = '40001', message = 'This client is no longer in the expected list. Refresh and try again.';
  end if;
  perform set_config('app.client_trash_transition',p_client_id::text,true);
  update public.client_master set status = v_status,
    inactivated_at = case when v_status = 'Inactive' then (v_prior->>'inactivated_at')::date end
    where id = p_client_id;
  perform set_config('app.client_trash_transition','',true);
  insert into public.client_master_activity(client_id,action,previous_value,new_value,actor_user_id)
    values (p_client_id,case when p_deleted then 'client_master_deleted' else 'client_master_restored' end,
      case when p_deleted then v_prior else jsonb_build_object('status','Deleted') end,
      jsonb_build_object('status',v_status,'actorProfileId',p_actor_profile_id),p_actor_user_id);
  return jsonb_build_object('id',p_client_id,'status',v_status);
end;
$$;
revoke all on function public.set_client_master_deleted(uuid,timestamptz,boolean,uuid,uuid) from public, anon, authenticated;
grant execute on function public.set_client_master_deleted(uuid,timestamptz,boolean,uuid,uuid) to service_role;

commit;
