-- Apply after the 2026-09-26 migrations. Back up operational tables first.
-- No existing case, claim, annual row, or client-master record is rewritten.
begin;

create or replace function public.purge_deleted_items()
returns void language plpgsql security definer set search_path = '' as $$
declare cutoff timestamptz := now() - interval '3 days';
begin
  with expired as materialized (
    select announcement_id, staff_profile_id from public.announcement_recipient_trash
    where deleted_at < cutoff for update
  ), removed_recipients as (
    delete from public.announcement_recipients r using expired e
    where r.announcement_id = e.announcement_id and r.staff_profile_id = e.staff_profile_id
    returning r.announcement_id
  )
  delete from public.announcement_recipient_trash t using expired e
    where t.announcement_id = e.announcement_id and t.staff_profile_id = e.staff_profile_id;

  -- Deleted cases retain their progress entries and My Work links indefinitely.
  delete from public.client_master_duplicate_trash where deleted_at < cutoff;
end;
$$;
revoke all on function public.purge_deleted_items() from public, anon, authenticated;
grant execute on function public.purge_deleted_items() to service_role;

alter table public.tax_cases add column if not exists updated_by_profile_id uuid references public.staff_profiles(id);
create table if not exists public.tax_case_assignment_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tax_cases(id) on delete restrict,
  old_tax_pic_profile_id uuid,
  new_tax_pic_profile_id uuid,
  old_accounting_pic_profile_id uuid,
  new_accounting_pic_profile_id uuid,
  changed_by_profile_id uuid references public.staff_profiles(id),
  changed_at timestamptz not null default now()
);
create index if not exists tax_case_assignment_events_case_idx on public.tax_case_assignment_events(case_id, changed_at desc);
alter table public.tax_case_assignment_events enable row level security;
revoke all on public.tax_case_assignment_events from public, anon, authenticated;

create or replace function public.track_tax_case_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.tax_pic_profile_id is distinct from new.tax_pic_profile_id
    or old.accounting_pic_profile_id is distinct from new.accounting_pic_profile_id then
    insert into public.tax_case_assignment_events (
      case_id, old_tax_pic_profile_id, new_tax_pic_profile_id,
      old_accounting_pic_profile_id, new_accounting_pic_profile_id, changed_by_profile_id
    ) values (
      new.id, old.tax_pic_profile_id, new.tax_pic_profile_id,
      old.accounting_pic_profile_id, new.accounting_pic_profile_id, new.updated_by_profile_id
    );
  end if;
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
drop trigger if exists tax_case_changes on public.tax_cases;
create trigger tax_case_changes before update on public.tax_cases
  for each row execute function public.track_tax_case_changes();

create table if not exists public.monthly_tax_claim_prints (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.monthly_tax_claims(id) on delete restrict,
  draft_snapshot jsonb not null,
  printed_by_profile_id uuid not null references public.staff_profiles(id),
  printed_at timestamptz not null default now()
);
create index if not exists monthly_tax_claim_prints_claim_idx on public.monthly_tax_claim_prints(claim_id, printed_at desc);
alter table public.monthly_tax_claim_prints enable row level security;
revoke all on public.monthly_tax_claim_prints from public, anon, authenticated;

create or replace function public.prepare_monthly_tax_claim_print(
  p_claim_id uuid, p_version timestamptz, p_actor_profile_id uuid
) returns public.monthly_tax_claim_prints
language plpgsql security invoker set search_path = '' as $$
declare saved public.monthly_tax_claim_prints;
begin
  insert into public.monthly_tax_claim_prints(claim_id, draft_snapshot, printed_by_profile_id)
    select id, draft, p_actor_profile_id from public.monthly_tax_claims
    where id = p_claim_id and updated_at = p_version
    returning * into saved;
  if not found then return null; end if;
  return saved;
end;
$$;
revoke all on function public.prepare_monthly_tax_claim_print(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.prepare_monthly_tax_claim_print(uuid, timestamptz, uuid) to service_role;

-- Service-role-only RPC: the upsert, activity trail, and optional import batch
-- either all commit or all roll back. Column names come only from client_master.
create or replace function public.commit_client_master_import(
  p_rows jsonb, p_actor_user_id uuid, p_actor_profile_id uuid,
  p_operation text default 'save', p_file_name text default null, p_file_sha256 text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  prior jsonb;
  saved record;
  columns_sql text;
  values_sql text;
  updates_sql text;
  result_rows jsonb := '[]'::jsonb;
  created_count integer := 0;
  updated_count integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Expected a nonempty client array';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if nullif(item->>'client_code', '') is null then raise exception 'Client code is required'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(item->>'client_code', 0));
    select to_jsonb(c) into prior from public.client_master c
      where c.client_code = item->>'client_code' for update;
    select string_agg(format('%I', key), ', ' order by key),
           string_agg(format('r.%I', key), ', ' order by key),
           string_agg(format('%I = excluded.%I', key, key), ', ' order by key)
      into columns_sql, values_sql, updates_sql
      from jsonb_object_keys(item) as keys(key)
      join pg_catalog.pg_attribute a on a.attrelid = 'public.client_master'::regclass
        and a.attname = key and a.attnum > 0 and not a.attisdropped
      where key not in ('id', 'client_code', 'created_at', 'updated_at');
    columns_sql := 'client_code, ' || columns_sql;
    values_sql := 'r.client_code, ' || values_sql;
    execute format(
      'insert into public.client_master (%s) select %s from jsonb_populate_record(null::public.client_master, $1) as r '
      || 'on conflict (client_code) do update set %s returning id, client_code, legal_name',
      columns_sql, values_sql, updates_sql
    ) into saved using item;
    insert into public.client_master_activity(client_id, action, previous_value, new_value, actor_user_id)
      values (saved.id, case when prior is null then 'client_master_created' else 'client_master_updated' end,
        prior, item, p_actor_user_id);
    if prior is null then created_count := created_count + 1;
    else updated_count := updated_count + 1; end if;
    result_rows := result_rows || jsonb_build_array(jsonb_build_object(
      'id', saved.id, 'client_code', saved.client_code, 'legal_name', saved.legal_name));
  end loop;
  if p_operation = 'bulk-import' then
    insert into public.client_import_batches (
      imported_by_profile_id, file_name, file_sha256, total_rows, valid_rows,
      created_count, updated_count, rejected_rows, committed_at
    ) values (
      p_actor_profile_id, p_file_name, p_file_sha256, jsonb_array_length(p_rows),
      jsonb_array_length(p_rows), created_count, updated_count, '[]'::jsonb, now()
    );
  end if;
  return jsonb_build_object('data', result_rows, 'created', created_count, 'updated', updated_count);
end;
$$;
revoke all on function public.commit_client_master_import(jsonb, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.commit_client_master_import(jsonb, uuid, uuid, text, text, text) to service_role;

commit;
