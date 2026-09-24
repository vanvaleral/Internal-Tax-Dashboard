-- Immutable yearly PIC allocation ledger. Allocation updates and their audit
-- records are committed in one database transaction through the RPC below.

create table if not exists public.client_pic_allocation_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.client_master(id) on delete restrict,
  allocation_year integer not null check (allocation_year between 2000 and 2200),
  previous_tax_pic_profile_id uuid references public.staff_profiles(id),
  previous_tax_pic_name text,
  next_tax_pic_profile_id uuid references public.staff_profiles(id),
  next_tax_pic_name text,
  previous_accounting_pic_profile_id uuid references public.staff_profiles(id),
  previous_accounting_pic_name text,
  next_accounting_pic_profile_id uuid references public.staff_profiles(id),
  next_accounting_pic_name text,
  changed_by_profile_id uuid references public.staff_profiles(id),
  change_source text not null default 'allocation_workspace',
  created_at timestamptz not null default now()
);

create index if not exists idx_client_pic_allocation_history_client_year
  on public.client_pic_allocation_history(client_id, allocation_year desc, created_at desc);

alter table public.client_pic_allocation_history enable row level security;
revoke all on table public.client_pic_allocation_history from anon, authenticated;
grant select on table public.client_pic_allocation_history to authenticated;

drop policy if exists client_pic_allocation_history_leadership_read on public.client_pic_allocation_history;
create policy client_pic_allocation_history_leadership_read
  on public.client_pic_allocation_history for select
  to authenticated
  using (public.current_user_is_leadership());

insert into public.client_pic_allocation_history (
  client_id, allocation_year,
  next_tax_pic_profile_id, next_tax_pic_name,
  next_accounting_pic_profile_id, next_accounting_pic_name,
  change_source, created_at
)
select
  client.id,
  coalesce(client.engagement_start_year, extract(year from client.contract_started_at)::integer, extract(year from client.created_at)::integer),
  client.tax_pic_profile_id, client.tax_pic_name,
  client.accounting_pic_profile_id, client.accounting_pic_name,
  'migration_snapshot', client.created_at
from public.client_master client
where not exists (
  select 1 from public.client_pic_allocation_history history where history.client_id = client.id
);

create or replace function public.apply_client_pic_allocation_batch(
  p_changes jsonb,
  p_allocation_year integer,
  p_changed_by_profile_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  change jsonb;
  current_client public.client_master%rowtype;
  changed_count integer := 0;
begin
  if p_allocation_year < 2000 or p_allocation_year > 2200 then
    raise exception 'Allocation year is invalid';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'At least one allocation change is required';
  end if;

  for change in select value from jsonb_array_elements(p_changes)
  loop
    select * into current_client
    from public.client_master
    where id = (change->>'client_id')::uuid
    for update;

    if not found then raise exception 'Client % was not found', change->>'client_id'; end if;

    insert into public.client_pic_allocation_history (
      client_id, allocation_year,
      previous_tax_pic_profile_id, previous_tax_pic_name,
      next_tax_pic_profile_id, next_tax_pic_name,
      previous_accounting_pic_profile_id, previous_accounting_pic_name,
      next_accounting_pic_profile_id, next_accounting_pic_name,
      changed_by_profile_id
    ) values (
      current_client.id, p_allocation_year,
      current_client.tax_pic_profile_id, current_client.tax_pic_name,
      nullif(change->>'tax_pic_profile_id', '')::uuid, nullif(change->>'tax_pic_name', ''),
      current_client.accounting_pic_profile_id, current_client.accounting_pic_name,
      nullif(change->>'accounting_pic_profile_id', '')::uuid, nullif(change->>'accounting_pic_name', ''),
      p_changed_by_profile_id
    );

    update public.client_master set
      previous_tax_pic_name = current_client.tax_pic_name,
      previous_accounting_pic_name = current_client.accounting_pic_name,
      tax_pic_profile_id = nullif(change->>'tax_pic_profile_id', '')::uuid,
      tax_pic_name = nullif(change->>'tax_pic_name', ''),
      accounting_pic_profile_id = nullif(change->>'accounting_pic_profile_id', '')::uuid,
      accounting_pic_name = nullif(change->>'accounting_pic_name', '')
    where id = current_client.id;

    insert into public.client_master_activity (client_id, action, previous_value, new_value, actor_user_id)
    values (
      current_client.id,
      'pic_allocation_changed',
      jsonb_build_object('allocation_year', p_allocation_year, 'tax_pic', current_client.tax_pic_name, 'accounting_pic', current_client.accounting_pic_name),
      jsonb_build_object('allocation_year', p_allocation_year, 'tax_pic', change->>'tax_pic_name', 'accounting_pic', change->>'accounting_pic_name'),
      null
    );
    changed_count := changed_count + 1;
  end loop;
  return changed_count;
end;
$$;

revoke all on function public.apply_client_pic_allocation_batch(jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.apply_client_pic_allocation_batch(jsonb, integer, uuid) to service_role;
