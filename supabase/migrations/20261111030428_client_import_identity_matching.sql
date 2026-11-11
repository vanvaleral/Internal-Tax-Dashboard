begin;

create or replace function public.client_import_name_key(p_name text)
returns text language sql immutable security invoker set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(lower(btrim(coalesce(p_name, ''))),
    '^(pt|cv|fa|but|ud|firma|yayasan|koperasi)\.?\s+', '', 'i'), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.client_import_form_key(p_form text, p_name text)
returns text language sql immutable security invoker set search_path = '' as $$
  select regexp_replace(lower(coalesce(nullif(btrim(p_form), ''),
    substring(btrim(p_name) from '(?i)^(pt|cv|fa|but|ud|firma|yayasan|koperasi)\.?\s+'), '')), '[.\s]+', '', 'g');
$$;

-- The preview and commit use exactly the same identity resolution rules.
create or replace function public.match_client_master_import(p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb; target public.client_master%rowtype;
  code_ids uuid[]; npwp_ids uuid[]; name_ids uuid[];
  target_id uuid; seen_targets text[] := array[]::text[];
  code_key text; npwp_key text; name_key text; form_key text; basis text;
  errors jsonb; matches jsonb := '[]'::jsonb; resolved jsonb := '[]'::jsonb;
  row_number integer := 1; target_key text;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Expected a nonempty client array';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    row_number := row_number + 1;
    errors := '[]'::jsonb; target_id := null; target := null; basis := null;
    code_key := lower(btrim(coalesce(item->>'client_code', '')));
    npwp_key := regexp_replace(coalesce(item->>'npwp', ''), '[^0-9]', '', 'g');
    name_key := public.client_import_name_key(item->>'legal_name');
    form_key := public.client_import_form_key(item->>'company_form', item->>'legal_name');
    select array_agg(c.id) into code_ids from public.client_master c where code_key <> '' and lower(btrim(c.client_code)) = code_key;
    select array_agg(c.id) into npwp_ids from public.client_master c where length(npwp_key) >= 15
      and regexp_replace(coalesce(c.npwp, ''), '[^0-9]', '', 'g') = npwp_key;
    select array_agg(c.id) into name_ids from public.client_master c where name_key <> ''
      and public.client_import_name_key(c.legal_name) = name_key
      and (form_key = '' or public.client_import_form_key(c.company_form, c.legal_name) = ''
        or public.client_import_form_key(c.company_form, c.legal_name) = form_key);

    if coalesce(cardinality(code_ids), 0) > 1 then
      errors := errors || jsonb_build_array('Client code matches multiple records. Resolve the duplicate first.');
    elsif cardinality(code_ids) = 1 then target_id := code_ids[1]; basis := 'code';
    elsif coalesce(cardinality(npwp_ids), 0) > 1 then
      errors := errors || jsonb_build_array('NPWP matches multiple records. Supply the existing client code.');
    elsif cardinality(npwp_ids) = 1 then target_id := npwp_ids[1]; basis := 'npwp';
    elsif coalesce(cardinality(name_ids), 0) > 1 then
      errors := errors || jsonb_build_array('Client name is ambiguous. Supply the existing client code or NPWP and company form.');
    elsif cardinality(name_ids) = 1 then target_id := name_ids[1]; basis := 'name';
    end if;

    if target_id is not null then
      select c.* into target from public.client_master c where c.id = target_id;
      if exists(select 1 from unnest(npwp_ids) id where id <> target_id)
        or (cardinality(name_ids) > 0 and not (target_id = any(name_ids))) then
        errors := errors || jsonb_build_array('Client code, NPWP and name identify different existing clients. Correct the file first.');
      end if;
      if basis = 'name' and npwp_key <> '' and nullif(regexp_replace(coalesce(target.npwp, ''), '[^0-9]', '', 'g'), '') is not null
        and npwp_key <> regexp_replace(target.npwp, '[^0-9]', '', 'g') then
        errors := errors || jsonb_build_array('The matching name has a different NPWP. Use the existing code for an intentional correction.');
      end if;
      item := item || jsonb_build_object('client_code', target.client_code);
    elsif code_key = '' then
      errors := errors || jsonb_build_array('A new client needs a client code. A blank code is allowed only for a unique existing match.');
    end if;
    if name_key = '' then errors := errors || jsonb_build_array('Client name is required.'); end if;
    target_key := coalesce(target_id::text, 'code:' || code_key);
    if target_key = any(seen_targets) then
      errors := errors || jsonb_build_array('Multiple file rows would update the same client. Keep only one row per client.');
    end if;
    seen_targets := array_append(seen_targets, target_key);
    matches := matches || jsonb_build_array(jsonb_build_object(
      'row', row_number, 'clientCode', coalesce(target.client_code, item->>'client_code'),
      'clientId', target_id, 'updatedAt', target.updated_at, 'matchedBy', basis,
      'action', case when target_id is null then 'create' else 'update' end, 'errors', errors));
    resolved := resolved || jsonb_build_array(item);
  end loop;
  return jsonb_build_object('rows', resolved, 'matches', matches);
end;
$$;

create or replace function public.commit_matched_client_import(
  p_rows jsonb, p_expected_matches jsonb, p_actor_user_id uuid, p_actor_profile_id uuid,
  p_file_name text default null, p_file_sha256 text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare matched jsonb;
begin
  -- Rare bulk imports briefly serialize master writes, never normal reads.
  -- A timeout/deadlock aborts the entire import, including its audit entries.
  perform set_config('lock_timeout', '5s', true);
  lock table public.client_master in share row exclusive mode;
  matched := public.match_client_master_import(p_rows);
  if p_expected_matches is distinct from matched->'matches' then
    raise exception using errcode = '40001', message = 'Client records changed since preview. Close this preview and upload the file again.';
  end if;
  if exists(select 1 from jsonb_array_elements(matched->'matches') m where jsonb_array_length(m->'errors') > 0) then
    raise exception using errcode = '22023', message = 'Import contains ambiguous or invalid client matches.';
  end if;
  return public.commit_client_master_import(matched->'rows', p_actor_user_id, p_actor_profile_id, 'bulk-import', p_file_name, p_file_sha256);
end;
$$;

revoke all on function public.client_import_name_key(text) from public, anon, authenticated;
revoke all on function public.client_import_form_key(text, text) from public, anon, authenticated;
revoke all on function public.match_client_master_import(jsonb) from public, anon, authenticated;
revoke all on function public.commit_matched_client_import(jsonb, jsonb, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.client_import_name_key(text), public.client_import_form_key(text, text),
  public.match_client_master_import(jsonb), public.commit_matched_client_import(jsonb, jsonb, uuid, uuid, text, text) to service_role;

commit;
