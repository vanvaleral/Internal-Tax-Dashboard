-- Additive, service-only fast path. No existing records or policies change.
begin;
create function public.save_case_progress_fast(p_case_id uuid, p_actor_profile_id uuid, p_entry text, p_entry_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' set lock_timeout = '2s' as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_case public.tax_cases%rowtype;
  v_saved public.tax_case_progress_entries%rowtype;
begin
  if p_entry_id is null or p_case_id is null or p_entry is null or char_length(btrim(p_entry)) not between 1 and 1000 then
    raise exception 'Enter a follow-up of 1 to 1000 characters with valid identifiers.' using errcode = '22023';
  end if;
  select * into v_actor from public.staff_profiles where id = p_actor_profile_id and directory_active = true for share;
  if not found then raise exception 'Active staff access is required.' using errcode = '42501'; end if;
  select * into v_case from public.tax_cases where id = p_case_id and deleted_at is null for share;
  if not found or (lower(coalesce(v_actor.role::text,'')) not in ('leader','supervisor','partner','admin')
    and v_case.tax_pic_profile_id is distinct from p_actor_profile_id and v_case.accounting_pic_profile_id is distinct from p_actor_profile_id) then
    raise exception 'You are not assigned to this case.' using errcode = '42501';
  end if;
  insert into public.tax_case_progress_entries(id,case_id,entry,created_by_profile_id)
    values(p_entry_id,p_case_id,btrim(p_entry),p_actor_profile_id) on conflict(id) do nothing returning * into v_saved;
  if not found then
    select * into v_saved from public.tax_case_progress_entries where id = p_entry_id;
    if not found or v_saved.case_id is distinct from p_case_id or v_saved.created_by_profile_id is distinct from p_actor_profile_id or v_saved.entry is distinct from btrim(p_entry) then
      raise exception 'Follow-up request ID is already used for different content.' using errcode = '22023';
    end if;
  end if;
  return jsonb_build_object('id',v_saved.id,'entry',v_saved.entry,'createdAt',v_saved.created_at,
    'creatorName',coalesce(nullif(v_actor.display_name,''),nullif(v_actor.full_name,''),'Unknown'));
end;
$$;
revoke all on function public.save_case_progress_fast(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.save_case_progress_fast(uuid,uuid,text,uuid) to service_role;
commit;
