-- Additive category expansion. No client, fee, assignment or work-history rewrite.
begin;
set local lock_timeout = '5s';
alter table public.client_master drop constraint client_master_engagement_type_check;
alter table public.client_master add constraint client_master_engagement_type_check
  check (engagement_type in ('contract','on_demand','free_of_charge'));

create or replace function public.move_client_engagement_batch(changes jsonb, target_type text, actor_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare item jsonb; current_client public.client_master%rowtype; actor_user uuid; moved integer := 0;
begin
  select auth_user_id into actor_user from public.staff_profiles
  where id = actor_id and directory_active = true and role in ('leader','supervisor','partner','admin') for share;
  if actor_user is null then raise exception 'Leadership required' using errcode='42501'; end if;
  if changes is null or target_type is null or target_type not in ('contract','on_demand','free_of_charge')
     or jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) not between 1 and 500 then
    raise exception 'Invalid engagement change';
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(changes)) <> jsonb_array_length(changes) then
    raise exception 'Duplicate clients';
  end if;
  for item in select value from jsonb_array_elements(changes) order by value->>'id' loop
    select * into current_client from public.client_master where id=(item->>'id')::uuid for update;
    if not found or current_client.status <> 'Active' or current_client.engagement_type is distinct from item->>'before_type' then
      raise exception 'Client engagement changed; refresh' using errcode='40001';
    end if;
    if current_client.engagement_type = target_type then continue; end if;
    update public.client_master set engagement_type=target_type where id=current_client.id;
    insert into public.client_master_activity(client_id,action,previous_value,new_value,actor_user_id)
      values(current_client.id,'client_engagement_changed',jsonb_build_object('engagement_type',current_client.engagement_type),jsonb_build_object('engagement_type',target_type),actor_user);
    moved := moved + 1;
  end loop;
  return moved;
end;
$$;
revoke all on function public.move_client_engagement_batch(jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.move_client_engagement_batch(jsonb,text,uuid) to service_role;
commit;
