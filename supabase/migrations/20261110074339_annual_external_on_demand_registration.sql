-- Only new external Annual rows use this transaction. Ordinary cell edits keep their existing CAS path.
set lock_timeout = '5s';

create or replace function public.commit_annual_external_clients(
  p_scope text, p_expected_version integer, p_payload jsonb,
  p_registration_ids text[], p_actor_id uuid
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_actor public.staff_profiles%rowtype;
  v_state public.operational_workspace_state%rowtype;
  v_client public.client_master%rowtype;
  v_payload jsonb := p_payload;
  v_row jsonb;
  v_id text;
  v_name text;
  v_key text;
  v_form text;
  v_matches uuid[];
  v_client_id uuid;
  v_created boolean;
  v_leadership boolean;
  v_index integer;
  v_count integer;
  v_code text;
begin
  if p_scope is null or p_scope not in ('annual_accounting','annual_tax')
    or p_expected_version is null or p_expected_version < 0
    or jsonb_typeof(p_payload) is distinct from 'array'
    or coalesce(cardinality(p_registration_ids),0) not between 1 and 250 then
    raise exception 'Invalid annual registration request.' using errcode = '22023';
  end if;
  select * into v_actor from public.staff_profiles where id = p_actor_id
    and directory_active and auth_user_id is not null and archived_at is null
    and access_deletion_started_at is null and access_deleted_at is null for share;
  if not found then raise exception 'Only an active staff account can add annual clients.' using errcode = '42501'; end if;
  v_leadership := coalesce(lower(v_actor.role),'staff') in ('leader','supervisor','partner','admin');
  if not v_leadership and v_actor.team_division is distinct from
    (case when p_scope = 'annual_tax' then 'Tax Team' else 'Accounting Team' end) then
    raise exception 'Only the corresponding team PIC can add annual clients.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('annual-registration:' || p_scope,0));
  select * into v_state from public.operational_workspace_state where scope = p_scope for update;
  if coalesce(v_state.version,0) <> p_expected_version then return jsonb_build_object('saved',false); end if;
  if exists (select 1 from unnest(p_registration_ids) id group by id having count(*) > 1)
    or exists (select 1 from unnest(p_registration_ids) id where id is null or id = '') then
    raise exception 'Annual registration IDs must be unique.' using errcode = '22023';
  end if;

  -- Serialize the short registration batch with Master imports too, not only other Annual requests.
  lock table public.client_master in share row exclusive mode;
  foreach v_id in array p_registration_ids loop
    select count(*) into v_count from jsonb_array_elements(v_payload) r where coalesce(r->>'id',r->>'annualWorkId') = v_id;
    if v_count <> 1 or exists (select 1 from jsonb_array_elements(coalesce(v_state.payload,'[]'::jsonb)) r where coalesce(r->>'id',r->>'annualWorkId') = v_id) then
      raise exception 'Only newly created annual rows can register a client.' using errcode = '22023';
    end if;
    select value, (ordinality - 1)::integer into v_row,v_index from jsonb_array_elements(v_payload) with ordinality
      where coalesce(value->>'id',value->>'annualWorkId') = v_id;
    if coalesce(v_row->>'clientId','') <> '' or coalesce(v_row->>'sourceClientId','') <> '' or coalesce(v_row->>'deletedAt','') <> '' then
      raise exception 'Only external annual rows can register a client.' using errcode = '22023';
    end if;
    if not v_leadership and coalesce(v_row->>(case when p_scope = 'annual_tax' then 'taxPicProfileId' else 'accountingPicProfileId' end),'') <> p_actor_id::text then
      raise exception 'This annual row is not eligible for your PIC workload.' using errcode = '42501';
    end if;
    v_name := btrim(v_row->>'clientName');
    if coalesce(length(v_name),0) not between 1 and 160 then raise exception 'Enter an annual client name up to 160 characters.' using errcode = '22023'; end if;
    v_form := upper(substring(v_name from '(?i)^(PT|CV|FA|BUT|UD|FIRMA|YAYASAN|KOPERASI)[. ]+'));
    if v_form is null and p_scope = 'annual_tax' and coalesce(v_row->>'subjectType','Individual') = 'Individual' then v_form := 'INDIVIDUAL'; end if;
    v_key := btrim(regexp_replace(lower(regexp_replace(v_name,'(?i)^(pt|cv|fa|but|ud|firma|yayasan|koperasi)[. ]+','','')),'[^[:alnum:]]+',' ','g'));
    if v_key = '' then raise exception 'Enter a client name containing letters or numbers.' using errcode = '22023'; end if;
    v_created := false;
    v_client_id := null;

    -- A previous-year external identity follows its registry link even after its Annual label changes.
    if coalesce(v_row->>'registeredClientId','') <> '' then
      select * into v_client from public.client_master where id = (v_row->>'registeredClientId')::uuid;
      if not found or v_client.status <> 'Active' then raise exception 'The registered annual client is archived or unavailable. Ask leadership to review it.' using errcode = '22023'; end if;
      v_client_id := v_client.id;
    else
      select array_agg(c.id) into v_matches from public.client_master c
      where c.duplicate_of_client_id is null
        and btrim(regexp_replace(lower(regexp_replace(c.legal_name,'(?i)^(pt|cv|fa|but|ud|firma|yayasan|koperasi)[. ]+','','')),'[^[:alnum:]]+',' ','g')) = v_key
        and (v_form is null or coalesce(
          case when lower(btrim(c.company_form)) in ('individual','orang pribadi','op','perorangan') then 'INDIVIDUAL' else nullif(upper(btrim(c.company_form)),'') end,
          upper(substring(c.legal_name from '(?i)^(PT|CV|FA|BUT|UD|FIRMA|YAYASAN|KOPERASI)[. ]+')),'INDIVIDUAL') = v_form);
      if cardinality(v_matches) > 1 then raise exception 'Multiple Client Master records match this annual client. Ask leadership to resolve the duplicate before saving.' using errcode = '22023'; end if;
      if cardinality(v_matches) = 1 then
        select * into v_client from public.client_master where id = v_matches[1];
        if v_client.status <> 'Active' then raise exception 'An archived or prospective client matches this annual client. Ask leadership to review it before saving.' using errcode = '22023'; end if;
        v_client_id := v_client.id;
      end if;
    end if;
    if v_client_id is null then
      -- Imports can leave the shared sequence behind existing client codes. Never reuse one.
      loop
        v_code := nextval('public.client_master_client_code_seq')::text;
        exit when not exists (select 1 from public.client_master where client_code ~ '^CL-[0-9]+$'
          and regexp_replace(client_code,'[^0-9]','','g')::numeric = v_code::numeric);
      end loop;
      insert into public.client_master (client_code,legal_name,company_form,status,engagement_type,source_system,source_row_key)
        values ('CL-' || lpad(v_code,greatest(5,length(v_code)),'0'),v_name,
          case when v_form = 'INDIVIDUAL' then 'Individual' else v_form end,'Active','on_demand','annual_external',
          p_scope || ':' || coalesce(v_row->>'annualClientId',v_row->>'subjectId',v_id)) returning * into v_client;
      v_client_id := v_client.id;
      v_created := true;
    end if;
    v_row := v_row || jsonb_build_object('registeredClientId',v_client_id);
    v_payload := jsonb_set(v_payload,array[v_index::text],v_row);
    insert into public.client_master_activity (client_id,action,actor_user_id,new_value)
      values (v_client_id,case when v_created then 'annual_external_registered' else 'annual_external_linked' end,v_actor.auth_user_id,
        jsonb_build_object('scope',p_scope,'annualWorkId',v_id,'taxYear',v_row->'taxYear','engagementType',v_client.engagement_type));
  end loop;

  if v_state.scope is null then
    insert into public.operational_workspace_state (scope,payload,version,updated_by_profile_id)
      values (p_scope,v_payload,1,p_actor_id) on conflict (scope) do nothing;
  else
    update public.operational_workspace_state set payload = v_payload,version = p_expected_version + 1,
      updated_by_profile_id = p_actor_id,updated_at = now() where scope = p_scope and version = p_expected_version;
  end if;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'Annual workspace changed. Retry the save.' using errcode = '40001'; end if;
  return jsonb_build_object('saved',true,'payload',v_payload,'version',p_expected_version + 1);
end;
$$;

revoke all on function public.commit_annual_external_clients(text,integer,jsonb,text[],uuid) from public, anon, authenticated;
grant execute on function public.commit_annual_external_clients(text,integer,jsonb,text[],uuid) to service_role;
