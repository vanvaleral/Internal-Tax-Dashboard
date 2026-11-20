-- Disposable-schema smoke assertions. The fixture must seed two active staff
-- with the IDs below and reject 'PT Rollback Fixture' in tax_cases.client_name
-- with a CHECK constraint. This transaction creates no permanent records.
begin;

do $$
begin
  if has_function_privilege('authenticated','public.create_external_tax_case(uuid,uuid,text,text)','execute')
     or has_function_privilege('anon','public.create_external_tax_case(uuid,uuid,text,text)','execute') then
    raise exception 'External registration must not be callable by browser roles';
  end if;
end;
$$;

set local role service_role;
do $$
declare
  actor_id uuid := '10000000-0000-0000-0000-000000000001';
  other_id uuid := '10000000-0000-0000-0000-000000000002';
  case_id uuid := '20000000-0000-0000-0000-000000000001';
  result jsonb;
  client_id_value uuid;
begin
  result := public.create_external_tax_case(actor_id,case_id,'PT External Practice','Himbauan');
  client_id_value := (result->'case'->>'client_id')::uuid;
  if result->'case'->>'tax_pic_profile_id' <> actor_id::text or result->'case'->>'accounting_pic_profile_id' is not null then
    raise exception 'Wrong case assignment';
  end if;
  if not exists(select from public.client_master c where c.id=client_id_value and c.engagement_type='on_demand'
    and c.status='Active' and c.client_code <> 'CL-00001' and coalesce(c.monthly_fee,0)=0 and coalesce(c.annual_fee,0)=0
    and c.engagement_start is null and c.engagement_end is null and c.tax_pic_profile_id is null
    and c.accounting_pic_profile_id is null and not (c.has_pph21 or c.has_unifikasi or c.has_pph25_pp55 or c.has_pb1 or c.has_ppn)) then
    raise exception 'Unexpected On Demand registration defaults';
  end if;
  result := public.create_external_tax_case(actor_id,case_id,'PT External Practice','Himbauan');
  if result->>'replayed' is distinct from 'true' then raise exception 'Retry duplicated a confirmed request'; end if;
  result := public.create_external_tax_case(actor_id,gen_random_uuid(),'pt. External-Practice','Pemeriksaan');
  if result->'case'->>'client_id' is distinct from client_id_value::text then raise exception 'Exact match duplicated the client'; end if;
  begin
    perform public.create_external_tax_case(other_id,gen_random_uuid(),'PT External Practice','Himbauan');
    raise exception 'Unassigned user linked an existing client';
  exception when serialization_failure then null;
  end;
  insert into public.client_master(client_code,legal_name,status,engagement_type,monthly_fee)
    values('FIXTURE-CONTRACT','PT Contract Fixture','Active','contract',100);
  begin
    perform public.create_external_tax_case(actor_id,gen_random_uuid(),'PT Contract Fixture','Himbauan');
    raise exception 'Existing contract accepted through external entry';
  exception when serialization_failure then null;
  end;
  if not exists(select from public.client_master where client_code='FIXTURE-CONTRACT' and engagement_type='contract' and monthly_fee=100) then
    raise exception 'Existing contract changed';
  end if;
  begin
    perform public.create_external_tax_case(actor_id,gen_random_uuid(),'PT Rollback Fixture','Himbauan');
    raise exception 'Injected case failure was not enforced';
  exception when check_violation then null;
  end;
  if exists(select from public.client_master where legal_name='PT Rollback Fixture') then raise exception 'Failed case left an orphan client'; end if;
  if (select count(*) from public.client_master_activity a where a.client_id=client_id_value) <> 2 then
    raise exception 'Expected one registration and one link audit record';
  end if;
end;
$$;
rollback;
