-- Integration verification only: all fixture records/workspace writes are rolled back.
-- PostgreSQL sequences are nontransactional; allocating test codes can leave harmless gaps.
begin;
set local lock_timeout = '5s';
set local role service_role;
do $$
declare
  actor uuid;
  state public.operational_workspace_state%rowtype;
  baseline jsonb;
  result jsonb;
  row1 jsonb;
  row2 jsonb;
  v_payload jsonb;
  work1 text := gen_random_uuid()::text;
  work2 text := gen_random_uuid()::text;
  suffix text := gen_random_uuid()::text;
  registry uuid;
  existing uuid;
  n integer;
  v_version integer;
  rejected boolean;
begin
  select id into actor from public.staff_profiles where directory_active and auth_user_id is not null
    and archived_at is null and access_deletion_started_at is null and access_deleted_at is null
    and role in ('supervisor','partner','admin') limit 1;
  if actor is null then raise exception 'An active leadership fixture actor is required.'; end if;
  select * into state from public.operational_workspace_state where scope = 'annual_accounting' for update;
  v_version := coalesce(state.version,0);
  baseline := coalesce(state.payload,'[]'::jsonb);
  row1 := jsonb_build_object('id',work1,'annualWorkId',work1,'annualClientId',work1,
    'clientId','','clientName','PT Codex external test ' || suffix,'taxYear',2026,'contractType','Lepas',
    'accountingPicProfileId',actor,'taxPicProfileId',actor,'technicalAdminMonths','[]'::jsonb,
    'dataMonths','[]'::jsonb,'reportPreparationMonths','[]'::jsonb,'paymentAmount',450000,'ntpe','');
  select count(*) into n from public.client_master;
  result := public.commit_annual_external_clients('annual_accounting',v_version,baseline || jsonb_build_array(row1),array[work1],actor);
  assert result->>'saved' = 'true', 'external creation must commit';
  select s.payload, s.version into v_payload,v_version from public.operational_workspace_state s where scope = 'annual_accounting';
  select (r->>'registeredClientId')::uuid into registry from jsonb_array_elements(v_payload) r where r->>'id' = work1;
  assert registry is not null, 'workspace must carry the Master registry link';
  assert (select count(*) from public.client_master) = n + 1, 'exactly one Master client';
  assert (select engagement_type = 'on_demand' and status = 'Active' and accounting_pic_profile_id is null
    and tax_pic_profile_id is null and accounting_pic_name is null and tax_pic_name is null
    and monthly_fee is null and annual_fee is null and contract_started_at is null
    and not has_pph21 and not has_ppn from public.client_master where id = registry), 'annual data must not become Master allocation, fees or obligations';
  assert exists (select 1 from public.client_master_activity where client_id = registry and action = 'annual_external_registered'), 'creation must be audited';

  result := public.commit_annual_external_clients('annual_accounting',v_version - 1,v_payload,array[work1],actor);
  assert result->>'saved' = 'false', 'stale versions must fail before registration';
  rejected := false;
  begin
    perform public.commit_annual_external_clients('annual_accounting',v_version,v_payload,array[work1],actor);
  exception when invalid_parameter_value then rejected := true; end;
  assert rejected, 'confirmed work IDs cannot be registered twice';
  assert (select count(*) from public.client_master) = n + 1, 'retries must not duplicate clients';

  row2 := row1 || jsonb_build_object('id',work2,'annualWorkId',work2,'annualClientId',work1,'taxYear',2027,
    'clientName','A renamed Annual-only display label','registeredClientId',registry);
  result := public.commit_annual_external_clients('annual_accounting',v_version,v_payload || jsonb_build_array(row2),array[work2],actor);
  assert result->>'saved' = 'true', 'trusted previous-year identity must carry its registration';
  assert (select count(*) from public.client_master) = n + 1, 'previous years must reuse Master';
  assert (select legal_name = row1->>'clientName' from public.client_master where id = registry), 'Annual label changes must not rename Master';
  select s.payload,s.version into v_payload,v_version from public.operational_workspace_state s where scope = 'annual_accounting';

  insert into public.client_master (client_code,legal_name,company_form,engagement_type,monthly_fee,accounting_pic_profile_id)
    values ('TEST-ANNUAL-' || suffix,'Codex contract ' || suffix,'CV','contract',123456,actor) returning id into existing;
  work2 := gen_random_uuid()::text;
  row2 := row1 || jsonb_build_object('id',work2,'annualWorkId',work2,'clientName','cv. CODEX CONTRACT ' || suffix);
  result := public.commit_annual_external_clients('annual_accounting',v_version,v_payload || jsonb_build_array(row2),array[work2],actor);
  assert result->>'saved' = 'true', 'an existing active identity must be reused';
  assert exists (select 1 from jsonb_array_elements(result->'payload') r where r->>'id' = work2 and r->>'registeredClientId' = existing::text), 'normalized name and form match';
  assert (select engagement_type = 'contract' and monthly_fee = 123456 and accounting_pic_profile_id = actor from public.client_master where id = existing), 'never reclassify or reassign an existing client';
  select s.payload,s.version into v_payload,v_version from public.operational_workspace_state s where scope = 'annual_accounting';

  -- The first registration in this batch must also roll back when the second fails.
  insert into public.client_master (client_code,legal_name,status)
    values ('TEST-INACTIVE-' || suffix,'Archived Codex ' || suffix,'Inactive');
  work1 := gen_random_uuid()::text; work2 := gen_random_uuid()::text;
  row1 := row1 || jsonb_build_object('id',work1,'annualWorkId',work1,'clientName','Unique Codex rollback ' || suffix);
  row2 := row1 || jsonb_build_object('id',work2,'annualWorkId',work2,'clientName','Archived Codex ' || suffix);
  select count(*) into n from public.client_master;
  rejected := false;
  begin
    perform public.commit_annual_external_clients('annual_accounting',v_version,v_payload || jsonb_build_array(row1,row2),array[work1,work2],actor);
  exception when invalid_parameter_value then rejected := true; end;
  assert rejected, 'archived matches require review';
  assert (select count(*) from public.client_master) = n, 'failed batch cannot leave an orphan client';
  assert (select s.payload = v_payload and s.version = v_version from public.operational_workspace_state s where scope = 'annual_accounting'), 'failed batch cannot save partial Annual data';

  insert into public.client_master (client_code,legal_name,company_form)
    values ('TEST-DUP-A-' || suffix,'Duplicate Codex ' || suffix,'PT'),('TEST-DUP-B-' || suffix,'Duplicate Codex ' || suffix,'PT');
  row1 := row1 || jsonb_build_object('clientName','PT Duplicate Codex ' || suffix);
  rejected := false;
  begin
    perform public.commit_annual_external_clients('annual_accounting',v_version,v_payload || jsonb_build_array(row1),array[work1],actor);
  exception when invalid_parameter_value then rejected := true; end;
  assert rejected, 'ambiguous matches must never be guessed';

  rejected := false;
  begin
    perform public.commit_annual_external_clients('annual_accounting',v_version,v_payload || jsonb_build_array(row1),array[work1],gen_random_uuid());
  exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'unknown actors cannot create clients';
  assert not has_function_privilege('anon','public.commit_annual_external_clients(text,integer,jsonb,text[],uuid)','EXECUTE'), 'anonymous RPC must be blocked';
  assert not has_function_privilege('authenticated','public.commit_annual_external_clients(text,integer,jsonb,text[],uuid)','EXECUTE'), 'direct browser RPC must be blocked';

  select * into state from public.operational_workspace_state where scope = 'annual_tax' for update;
  v_payload := coalesce(state.payload,'[]'::jsonb); v_version := coalesce(state.version,0);
  work1 := gen_random_uuid()::text; work2 := gen_random_uuid()::text;
  row1 := jsonb_build_object('id',work1,'annualWorkId',work1,'subjectId',work1,'clientId','','sourceClientId','',
    'clientName','Codex Individual ' || suffix,'subjectType','Individual','groupName','PT a linked company',
    'taxYear',2026,'taxPicProfileId',actor,'accountingPicProfileId',actor);
  row2 := row1 || jsonb_build_object('id',work2,'annualWorkId',work2,'subjectId',work2,'taxYear',2027);
  select count(*) into n from public.client_master;
  result := public.commit_annual_external_clients('annual_tax',v_version,v_payload || jsonb_build_array(row1,row2),array[work1,work2],actor);
  assert result->>'saved' = 'true', 'Tax external creation must commit';
  select (r->>'registeredClientId')::uuid into registry from jsonb_array_elements(result->'payload') r where r->>'id' = work1;
  assert (select count(*) from public.client_master) = n + 1, 'same taxpayer in multiple years registers once';
  assert (select company_form = 'Individual' and engagement_type = 'on_demand' and legal_name = row1->>'clientName'
    and accounting_pic_profile_id is null and tax_pic_profile_id is null from public.client_master where id = registry), 'register the individual, not their linked company or Annual PICs';
  assert exists (select 1 from jsonb_array_elements(result->'payload') r where r->>'id' = work2 and r->>'registeredClientId' = registry::text), 'Tax work years share a registry identity';
end;
$$;
rollback;
select 'Annual external registration checks passed; fixture records rolled back.' as result;
