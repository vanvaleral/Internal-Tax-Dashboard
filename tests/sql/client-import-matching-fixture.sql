-- Fresh disposable LOCAL database only. All records below are synthetic.
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;
create table public.staff_profiles(id uuid primary key);
create table public.tax_cases(id uuid primary key, tax_pic_profile_id uuid, accounting_pic_profile_id uuid, updated_at timestamptz);
create table public.monthly_tax_claims(id uuid primary key, draft jsonb, updated_at timestamptz);
create table public.client_master(
  id uuid primary key default gen_random_uuid(), client_code text not null unique, legal_name text not null,
  npwp text, company_form text, monthly_fee numeric, annual_fee numeric, notes text,
  status text default 'Active', engagement_type text default 'contract',
  accounting_pic_name text, accounting_pic_profile_id uuid, tax_pic_name text, tax_pic_profile_id uuid,
  contract_started_at date, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.client_master_activity(id uuid default gen_random_uuid(), client_id uuid references public.client_master,
  action text, previous_value jsonb, new_value jsonb, actor_user_id uuid);
create table public.client_import_batches(imported_by_profile_id uuid, file_name text, file_sha256 text,
  total_rows integer, valid_rows integer, created_count integer, updated_count integer, rejected_rows jsonb, committed_at timestamptz);
create function public.fixture_touch_client() returns trigger language plpgsql as $$ begin new.updated_at := clock_timestamp(); return new; end $$;
create trigger fixture_touch before update on public.client_master for each row execute function public.fixture_touch_client();
grant all on all tables in schema public to service_role;
\ir ../../supabase/migrations/202609270001_operational_history_integrity.sql
\ir ../../supabase/migrations/20261111030428_client_import_identity_matching.sql

insert into public.staff_profiles values ('00000000-0000-4000-8000-000000000001');
insert into public.client_master(client_code,legal_name,npwp,company_form,monthly_fee,accounting_pic_name,engagement_type,status,contract_started_at) values
  ('CL-ONE','PT Example Co','123456789012345','PT',1000000,'Original PIC','free_of_charge','Active','2020-02-01'),
  ('CL-PT','PT Shared',null,'PT',2000000,null,'contract','Active',null),
  ('CL-CV','CV Shared',null,'CV',3000000,null,'contract','Active',null),
  ('CL-AMB1','PT Ambiguous',null,'PT',0,null,'contract','Active',null),
  ('CL-AMB2','Ambiguous',null,'PT',0,null,'contract','Active',null),
  ('CL-OTHER','Other Company','999999999999999','PT',0,null,'contract','Active',null),
  ('CL-INACTIVE','Inactive Client',null,'PT',0,null,'on_demand','Inactive',null);

set role service_role;
do $$
declare r jsonb; payload jsonb; saved jsonb; old_id uuid; before_count integer; before_audit integer; before_batches integer;
begin
  assert public.client_import_form_key(null,'PT. Shared') = 'pt', 'prefix inference';
  assert public.client_import_name_key('  PT. EXAMPLE Co ') = 'example co', 'normalized exact name';
  payload := '[{"client_code":"FILE-NEW","legal_name":"example co","monthly_fee":2500000}]';
  r := public.match_client_master_import(payload);
  assert r->'matches'->0->>'matchedBy' = 'name', 'bare name matches stored corporate name';
  assert r->'matches'->0->>'clientCode' = 'CL-ONE', 'canonical code must survive';
  select id into old_id from public.client_master where client_code = 'CL-ONE';
  saved := public.commit_matched_client_import(payload,r->'matches',null,'00000000-0000-4000-8000-000000000001');
  assert saved->>'updated' = '1' and saved->>'created' = '0', 'update not duplicate';
  assert (select id = old_id and monthly_fee = 2500000 and accounting_pic_name = 'Original PIC'
    and engagement_type = 'free_of_charge' and contract_started_at = '2020-02-01' from public.client_master where client_code = 'CL-ONE'), 'preserve ID, omitted fields and category';
  assert not exists(select 1 from public.client_master where client_code = 'FILE-NEW'), 'do not replace stable code';
  assert (select previous_value->>'monthly_fee' = '1000000' and new_value->>'monthly_fee' = '2500000' from public.client_master_activity where client_id = old_id), 'audit before and after';

  r := public.match_client_master_import('[{"legal_name":"Renamed with NPWP","npwp":"123456789012345"}]');
  assert r->'matches'->0->>'matchedBy' = 'npwp', 'NPWP priority';
  r := public.match_client_master_import('[{"legal_name":"Shared","company_form":"CV"}]');
  assert r->'matches'->0->>'clientCode' = 'CL-CV', 'respect corporate form';
  r := public.match_client_master_import('[{"legal_name":"Shared"}]');
  assert jsonb_array_length(r->'matches'->0->'errors') > 0, 'unknown form is ambiguous';
  r := public.match_client_master_import('[{"legal_name":"Ambiguous","company_form":"PT"}]');
  assert jsonb_array_length(r->'matches'->0->'errors') > 0, 'duplicate names need disambiguation';
  r := public.match_client_master_import('[{"client_code":"CL-AMB1","legal_name":"Ambiguous"}]');
  assert jsonb_array_length(r->'matches'->0->'errors') = 0, 'existing code disambiguates';
  r := public.match_client_master_import('[{"client_code":"CL-PT","legal_name":"Other Company","npwp":"999999999999999"}]');
  assert jsonb_array_length(r->'matches'->0->'errors') > 0, 'different code and NPWP targets rejected';
  r := public.match_client_master_import('[{"legal_name":"example co","npwp":"111111111111111"}]');
  assert jsonb_array_length(r->'matches'->0->'errors') > 0, 'name-only NPWP conflict rejected';
  r := public.match_client_master_import('[{"legal_name":"example co"},{"client_code":"CL-ONE","legal_name":"example co"}]');
  assert jsonb_array_length(r->'matches'->1->'errors') > 0, 'two aliases must not update same target twice';
  r := public.match_client_master_import('[{"legal_name":"Unknown new name"}]');
  assert jsonb_array_length(r->'matches'->0->'errors') > 0, 'new clients require a code';

  payload := '[{"legal_name":"Inactive Client","notes":"Imported note"}]';
  r := public.match_client_master_import(payload);
  perform public.commit_matched_client_import(payload,r->'matches',null,'00000000-0000-4000-8000-000000000001');
  assert (select status = 'Inactive' and engagement_type = 'on_demand' from public.client_master where client_code = 'CL-INACTIVE'), 'matching must not reactivate or reclassify';
  payload := '[{"legal_name":"example co","accounting_pic_name":null,"accounting_pic_profile_id":null}]';
  r := public.match_client_master_import(payload);
  perform public.commit_matched_client_import(payload,r->'matches',null,'00000000-0000-4000-8000-000000000001');
  assert (select accounting_pic_name is null and accounting_pic_profile_id is null from public.client_master where client_code = 'CL-ONE'), 'explicit blank PIC clears assignment';

  payload := '[{"legal_name":"example co","monthly_fee":999}]';
  r := public.match_client_master_import(payload);
  update public.client_master set notes = 'A newer edit' where client_code = 'CL-ONE';
  begin
    perform public.commit_matched_client_import(payload,r->'matches',null,'00000000-0000-4000-8000-000000000001');
    raise exception 'Stale preview was accepted';
  exception when serialization_failure then null;
  end;
  assert (select monthly_fee = 2500000 from public.client_master where client_code = 'CL-ONE'), 'stale preview cannot overwrite';

  select count(*) into before_count from public.client_master;
  select count(*) into before_audit from public.client_master_activity;
  select count(*) into before_batches from public.client_import_batches;
  payload := '[{"client_code":"CL-NEW","legal_name":"New Client"},{"client_code":"CL-BAD","legal_name":"Bad fee","monthly_fee":"invalid"}]';
  r := public.match_client_master_import(payload);
  begin
    perform public.commit_matched_client_import(payload,r->'matches',null,'00000000-0000-4000-8000-000000000001');
    raise exception 'Invalid row was accepted';
  exception when invalid_text_representation then null;
  end;
  assert (select count(*) = before_count from public.client_master), 'failure rolls back all clients';
  assert (select count(*) = before_audit from public.client_master_activity), 'failure rolls back activity';
  assert (select count(*) = before_batches from public.client_import_batches), 'failure rolls back batch';
  payload := '[{"client_code":"CL-NEW","legal_name":"New Client"}]';
  r := public.match_client_master_import(payload);
  saved := public.commit_matched_client_import(payload,r->'matches',null,'00000000-0000-4000-8000-000000000001');
  assert saved->>'created' = '1', 'unmatched coded client still creates';
end $$;
reset role;
do $$ begin
  assert not has_function_privilege('anon','public.match_client_master_import(jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','public.commit_matched_client_import(jsonb,jsonb,uuid,uuid,text,text)','EXECUTE');
  assert not exists(select 1 from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('match_client_master_import','commit_matched_client_import') and prosecdef), 'no definer bypass';
end $$;
select 'client import matching fixture passed' as result;
