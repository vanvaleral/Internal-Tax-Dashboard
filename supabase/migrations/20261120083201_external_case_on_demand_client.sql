create function public.create_external_tax_case(
  p_actor_id uuid, p_request_id uuid, p_client_name text, p_category text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_client public.client_master%rowtype;
  v_case public.tax_cases%rowtype;
  v_name text := btrim(p_client_name);
  v_key text := public.client_import_name_key(p_client_name);
  v_form text := public.client_import_form_key(null, p_client_name);
  v_person text;
  v_matches uuid[];
  v_code text;
  v_created boolean := false;
  v_leadership boolean;
  v_tax boolean;
begin
  if p_request_id is null or p_category is null or p_category not in ('Himbauan', 'Pemeriksaan')
    or coalesce(length(v_name),0) not between 1 and 160 or v_key = '' then
    raise exception using errcode = '22023', message = 'Enter a valid taxpayer name for Himbauan or Pemeriksaan.';
  end if;
  select * into v_actor from public.staff_profiles where id = p_actor_id and directory_active and auth_user_id is not null;
  if not found or coalesce(v_actor.team_division::text,'') not in ('Tax Team','Accounting Team') then
    raise exception using errcode = '42501', message = 'An active Tax or Accounting staff profile is required.';
  end if;
  v_leadership := v_actor.role::text in ('leader','supervisor','partner','admin');
  v_tax := v_actor.team_division::text = 'Tax Team';
  v_person := coalesce(nullif(btrim(v_actor.display_name),''),v_actor.full_name);

  -- Match within the same lock used by the Annual registration and import paths.
  perform set_config('lock_timeout','5s',true);
  lock table public.client_master in share row exclusive mode;
  select * into v_case from public.tax_cases where id = p_request_id;
  if found then
    if v_case.created_by = v_actor.auth_user_id and v_case.case_category = p_category and v_case.deleted_at is null
      and (v_leadership or p_actor_id in (v_case.tax_pic_profile_id,v_case.accounting_pic_profile_id))
      and exists (select from public.client_master_activity a where a.client_id = v_case.client_id
        and a.action in ('case_external_registered','case_external_linked')
        and a.new_value->>'caseId' = p_request_id::text and a.new_value->>'requestedName' = v_name) then
      return jsonb_build_object('case',to_jsonb(v_case),'replayed',true);
    end if;
    raise exception using errcode = '40001', message = 'This request has already been used. Refresh Cases before retrying.';
  end if;

  select array_agg(c.id) into v_matches from public.client_master c
    where c.duplicate_of_client_id is null and public.client_import_name_key(c.legal_name) = v_key
    and (v_form = '' or public.client_import_form_key(c.company_form,c.legal_name) in ('',v_form));
  if cardinality(v_matches) > 1 then
    raise exception using errcode = '40001', message = 'More than one client matches that name. Ask leadership to review the client link.';
  end if;
  if cardinality(v_matches) = 1 then
    select * into v_client from public.client_master where id = v_matches[1];
    if v_client.status <> 'Active' or v_client.engagement_type <> 'on_demand' or
      not (v_leadership or coalesce(p_actor_id in (v_client.tax_pic_profile_id,v_client.accounting_pic_profile_id),false)
        or exists (select from public.tax_cases c where c.client_id = v_client.id and c.deleted_at is null
          and p_actor_id in (c.tax_pic_profile_id,c.accounting_pic_profile_id))) then
      raise exception using errcode = '40001', message = 'A Client Master record already matches that name. Use Add Case to select it, or ask leadership to review access.';
    end if;
  else
    loop
      v_code := nextval('public.client_master_client_code_seq')::text;
      exit when not exists (select from public.client_master where client_code ~ '^CL-[0-9]+$'
        and regexp_replace(client_code,'[^0-9]','','g')::numeric = v_code::numeric);
    end loop;
    insert into public.client_master(client_code,legal_name,company_form,status,engagement_type,source_system,source_row_key)
      values ('CL-' || lpad(v_code,greatest(5,length(v_code)),'0'),v_name,nullif(upper(v_form),''),
        'Active','on_demand','case_external',p_request_id::text) returning * into v_client;
    v_created := true;
  end if;

  -- The creator gets the case assignment only, not a recurring Client Master PIC assignment.
  insert into public.tax_cases(id,client_id,client_name,case_type,case_category,stage,created_by,
    tax_pic_profile_id,tax_pic_name,accounting_pic_profile_id,accounting_pic_name,updated_by_profile_id)
  values (p_request_id,v_client.id,v_client.legal_name,p_category,p_category,'In Progress',v_actor.auth_user_id,
    case when v_tax then p_actor_id end,case when v_tax then v_person end,
    case when not v_tax then p_actor_id end,case when not v_tax then v_person end,p_actor_id)
  returning * into v_case;
  insert into public.client_master_activity(client_id,action,actor_user_id,new_value)
    values(v_client.id,case when v_created then 'case_external_registered' else 'case_external_linked' end,
      v_actor.auth_user_id,jsonb_build_object('caseId',v_case.id,'requestedName',v_name,'engagementType',v_client.engagement_type));
  return jsonb_build_object('case',to_jsonb(v_case),'replayed',false);
end;
$$;

revoke all on function public.create_external_tax_case(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_external_tax_case(uuid,uuid,text,text) to service_role;
