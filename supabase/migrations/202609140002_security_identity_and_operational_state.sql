-- Security and persistence hardening. This migration is additive except for
-- replacing permissive authenticated policies with scoped policies.

-- Keep role checks and security-definer helpers aligned with the UI role model.
create or replace function public.current_user_is_leadership()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles
    where auth_user_id = auth.uid()
      and role in ('leader', 'supervisor', 'partner', 'admin')
  );
$$;

-- UUID ownership is authoritative. Name fields remain as historical display
-- labels while the application migrates existing records safely.
alter table public.client_master
  add column if not exists tax_pic_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists accounting_pic_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists partner_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists supervisor_profile_id uuid references public.staff_profiles(id) on delete set null;

alter table public.tax_cases
  add column if not exists tax_pic_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column if not exists accounting_pic_profile_id uuid references public.staff_profiles(id) on delete set null;

-- Backfill only unambiguous display/full-name matches. Ambiguous legacy names
-- remain null and must be assigned by leadership in the client allocation UI.
with unique_staff as (
  select lower(coalesce(nullif(btrim(display_name), ''), full_name)) as identity_name, (array_agg(id))[1] as id
  from public.staff_profiles
  group by lower(coalesce(nullif(btrim(display_name), ''), full_name))
  having count(*) = 1
)
update public.client_master client
set tax_pic_profile_id = staff.id
from unique_staff staff
where client.tax_pic_profile_id is null
  and lower(coalesce(client.tax_pic_name, '')) = staff.identity_name;

with unique_staff as (
  select lower(coalesce(nullif(btrim(display_name), ''), full_name)) as identity_name, (array_agg(id))[1] as id
  from public.staff_profiles
  group by lower(coalesce(nullif(btrim(display_name), ''), full_name))
  having count(*) = 1
)
update public.client_master client
set accounting_pic_profile_id = staff.id
from unique_staff staff
where client.accounting_pic_profile_id is null
  and lower(coalesce(client.accounting_pic_name, '')) = staff.identity_name;

with unique_staff as (
  select lower(coalesce(nullif(btrim(display_name), ''), full_name)) as identity_name, (array_agg(id))[1] as id
  from public.staff_profiles
  group by lower(coalesce(nullif(btrim(display_name), ''), full_name))
  having count(*) = 1
)
update public.client_master client
set partner_profile_id = staff.id
from unique_staff staff
where client.partner_profile_id is null
  and lower(coalesce(client.partner_name, '')) = staff.identity_name;

with unique_staff as (
  select lower(coalesce(nullif(btrim(display_name), ''), full_name)) as identity_name, (array_agg(id))[1] as id
  from public.staff_profiles
  group by lower(coalesce(nullif(btrim(display_name), ''), full_name))
  having count(*) = 1
)
update public.client_master client
set supervisor_profile_id = staff.id
from unique_staff staff
where client.supervisor_profile_id is null
  and lower(coalesce(client.supervisor_name, '')) = staff.identity_name;

update public.tax_cases tax_case
set tax_pic_profile_id = client.tax_pic_profile_id,
    accounting_pic_profile_id = client.accounting_pic_profile_id
from public.client_master client
where tax_case.client_id = client.id
  and (tax_case.tax_pic_profile_id is null or tax_case.accounting_pic_profile_id is null);

create index if not exists idx_client_master_tax_pic_profile on public.client_master(tax_pic_profile_id);
create index if not exists idx_client_master_accounting_pic_profile on public.client_master(accounting_pic_profile_id);
create index if not exists idx_tax_cases_tax_pic_profile on public.tax_cases(tax_pic_profile_id);
create index if not exists idx_tax_cases_accounting_pic_profile on public.tax_cases(accounting_pic_profile_id);

-- Client master direct access is scoped. API writes use the service role only
-- after an explicit role check, so a browser cannot bypass the permission flow.
drop policy if exists client_master_authenticated_read on public.client_master;
drop policy if exists client_master_authenticated_write on public.client_master;
drop policy if exists client_master_read_scope on public.client_master;
drop policy if exists client_master_write_leadership on public.client_master;
create policy client_master_read_scope on public.client_master for select to authenticated
  using (
    public.current_user_is_leadership()
    or tax_pic_profile_id = public.current_staff_profile_id()
    or accounting_pic_profile_id = public.current_staff_profile_id()
  );
create policy client_master_write_leadership on public.client_master for all to authenticated
  using (public.current_user_is_leadership())
  with check (public.current_user_is_leadership());

drop policy if exists client_master_activity_authenticated_read on public.client_master_activity;
drop policy if exists client_master_activity_authenticated_insert on public.client_master_activity;
drop policy if exists client_master_activity_leadership_read on public.client_master_activity;
create policy client_master_activity_leadership_read on public.client_master_activity for select to authenticated
  using (public.current_user_is_leadership());

-- Do not grant raw client data or DML to browser clients. The application API
-- returns a scoped, fee-redacted response to staff and full data to leadership.
revoke all on table public.client_master from authenticated;
revoke all on table public.client_master_activity from authenticated;
revoke execute on function public.allocate_client_code() from authenticated;

-- Staff may read only their own profile. Profile writes are server-owned.
revoke insert, update, delete on table public.staff_profiles from authenticated;
grant select on table public.staff_profiles to authenticated;

create or replace function public.prevent_staff_profile_self_escalation()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and old.auth_user_id = auth.uid() then
    if new.role is distinct from old.role
      or new.auth_user_id is distinct from old.auth_user_id
      or new.team_division is distinct from old.team_division then
      raise exception 'Profile role, identity, and team changes require leadership approval.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_profiles_prevent_self_escalation on public.staff_profiles;
create trigger staff_profiles_prevent_self_escalation
before update on public.staff_profiles
for each row execute function public.prevent_staff_profile_self_escalation();

-- Case authorization moves from mutable display names to immutable profile IDs.
drop policy if exists tax_cases_read_scope on public.tax_cases;
drop policy if exists tax_cases_insert_scope on public.tax_cases;
drop policy if exists tax_cases_update_scope on public.tax_cases;
create policy tax_cases_read_scope on public.tax_cases for select to authenticated
  using (
    public.current_user_is_leadership()
    or tax_pic_profile_id = public.current_staff_profile_id()
    or accounting_pic_profile_id = public.current_staff_profile_id()
  );
create policy tax_cases_insert_scope on public.tax_cases for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.current_user_is_leadership()
      or tax_pic_profile_id = public.current_staff_profile_id()
      or accounting_pic_profile_id = public.current_staff_profile_id()
    )
  );
create policy tax_cases_update_scope on public.tax_cases for update to authenticated
  using (
    public.current_user_is_leadership()
    or tax_pic_profile_id = public.current_staff_profile_id()
    or accounting_pic_profile_id = public.current_staff_profile_id()
  )
  with check (
    public.current_user_is_leadership()
    or tax_pic_profile_id = public.current_staff_profile_id()
    or accounting_pic_profile_id = public.current_staff_profile_id()
  );
revoke all on table public.tax_cases from authenticated;

-- Authoritative shared workspace state for the existing dense Monthly and
-- Annual controls. Versions prevent silent overwrite between two browsers.
create table if not exists public.operational_workspace_state (
  scope text primary key check (scope in ('monthly_compliance', 'annual_accounting', 'annual_tax')),
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_by_profile_id uuid not null references public.staff_profiles(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_workspace_audit (
  id bigint generated always as identity primary key,
  scope text not null,
  version integer not null,
  actor_profile_id uuid not null references public.staff_profiles(id),
  action text not null default 'updated',
  created_at timestamptz not null default now()
);
create index if not exists operational_workspace_audit_scope_idx on public.operational_workspace_audit(scope, created_at desc);
alter table public.operational_workspace_state enable row level security;
alter table public.operational_workspace_audit enable row level security;
revoke all on table public.operational_workspace_state from authenticated;
revoke all on table public.operational_workspace_audit from authenticated;

-- Import batches preserve validation/commit evidence and prevent a failed file
-- from becoming an untraceable partial update.
create table if not exists public.client_import_batches (
  id uuid primary key default gen_random_uuid(),
  imported_by_profile_id uuid not null references public.staff_profiles(id),
  file_name text,
  file_sha256 text,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  rejected_rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);
create index if not exists client_import_batches_actor_idx on public.client_import_batches(imported_by_profile_id, created_at desc);
alter table public.client_import_batches enable row level security;
revoke all on table public.client_import_batches from authenticated;

-- An append-only points ledger is the only future source for official rewards.
create table if not exists public.performance_point_ledger (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id),
  period_key text not null,
  source_type text not null,
  source_key text not null,
  event_type text not null,
  points numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'reversed')),
  reviewer_profile_id uuid references public.staff_profiles(id),
  reversed_by_entry_id uuid references public.performance_point_ledger(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (source_key, event_type)
);
create index if not exists performance_point_ledger_staff_period_idx on public.performance_point_ledger(staff_profile_id, period_key, created_at desc);
alter table public.performance_point_ledger enable row level security;
revoke all on table public.performance_point_ledger from authenticated;
