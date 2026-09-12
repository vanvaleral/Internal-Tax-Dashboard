-- Shared operational records. This migration is additive and keeps existing client data intact.

alter table public.client_master add column if not exists notes text;
alter table public.client_master add column if not exists partner_name text;
alter table public.client_master add column if not exists supervisor_name text;
alter table public.client_master add column if not exists service_package text;
alter table public.client_master add column if not exists proposal_status text;
alter table public.client_master add column if not exists company_form text;

update public.client_master
set company_form = upper((regexp_match(legal_name, '^\s*(PT|CV|FA|UD|FIRMA|YAYASAN|KOPERASI)\.?\s+', 'i'))[1])
where (company_form is null or btrim(company_form) = '')
  and legal_name ~* '^\s*(PT|CV|FA|UD|FIRMA|YAYASAN|KOPERASI)\.?\s+';

create sequence if not exists public.client_master_client_code_seq;
do $$
declare
  highest_code bigint;
begin
  select coalesce(max(nullif(regexp_replace(client_code, '\D', '', 'g'), '')::bigint), 0)
  into highest_code
  from public.client_master
  where client_code ~ '^CL-[0-9]+$';
  if highest_code > 0 then
    perform setval('public.client_master_client_code_seq', highest_code, true);
  else
    perform setval('public.client_master_client_code_seq', 1, false);
  end if;
end;
$$;

create or replace function public.allocate_client_code()
returns text
language sql
security definer set search_path = public
as $$
  select 'CL-' || lpad(nextval('public.client_master_client_code_seq')::text, 3, '0');
$$;

grant execute on function public.allocate_client_code() to authenticated;

create table if not exists public.tax_cases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.client_master(id) on delete set null,
  client_name text not null,
  case_type text not null default 'Tax Consultation',
  stage text not null default 'Waiting Client Docs',
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  tax_pic_name text,
  accounting_pic_name text,
  due_date date,
  notes text,
  next_steps jsonb not null default '[]'::jsonb,
  closed_at date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tax_cases_tax_pic on public.tax_cases(tax_pic_name);
create index if not exists idx_tax_cases_accounting_pic on public.tax_cases(accounting_pic_name);
create index if not exists idx_tax_cases_stage on public.tax_cases(stage);

create or replace function public.current_staff_display_name()
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(nullif(btrim(display_name), ''), full_name)
  from public.staff_profiles
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_is_leadership()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles
    where auth_user_id = auth.uid()
      and role in ('supervisor', 'partner', 'admin')
  );
$$;

alter table public.tax_cases enable row level security;
drop policy if exists tax_cases_read_scope on public.tax_cases;
create policy tax_cases_read_scope on public.tax_cases for select to authenticated
  using (public.current_user_is_leadership() or tax_pic_name = public.current_staff_display_name() or accounting_pic_name = public.current_staff_display_name());
drop policy if exists tax_cases_insert_scope on public.tax_cases;
create policy tax_cases_insert_scope on public.tax_cases for insert to authenticated
  with check (created_by = auth.uid() and (public.current_user_is_leadership() or tax_pic_name = public.current_staff_display_name() or accounting_pic_name = public.current_staff_display_name()));
drop policy if exists tax_cases_update_scope on public.tax_cases;
create policy tax_cases_update_scope on public.tax_cases for update to authenticated
  using (public.current_user_is_leadership() or tax_pic_name = public.current_staff_display_name() or accounting_pic_name = public.current_staff_display_name())
  with check (public.current_user_is_leadership() or tax_pic_name = public.current_staff_display_name() or accounting_pic_name = public.current_staff_display_name());

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'all' check (audience in ('all', 'tax', 'accounting')),
  sender_profile_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.announcement_recipients (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  read_at timestamptz,
  primary key (announcement_id, staff_profile_id)
);

create index if not exists idx_announcement_recipients_staff on public.announcement_recipients(staff_profile_id, read_at);
alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;
drop policy if exists announcements_read_scope on public.announcements;
create policy announcements_read_scope on public.announcements for select to authenticated
  using (sender_profile_id in (select id from public.staff_profiles where auth_user_id = auth.uid()) or id in (select announcement_id from public.announcement_recipients where staff_profile_id in (select id from public.staff_profiles where auth_user_id = auth.uid())));
drop policy if exists announcement_recipients_read_self on public.announcement_recipients;
create policy announcement_recipients_read_self on public.announcement_recipients for select to authenticated
  using (staff_profile_id in (select id from public.staff_profiles where auth_user_id = auth.uid()));
drop policy if exists announcement_recipients_update_self on public.announcement_recipients;
create policy announcement_recipients_update_self on public.announcement_recipients for update to authenticated
  using (staff_profile_id in (select id from public.staff_profiles where auth_user_id = auth.uid()))
  with check (staff_profile_id in (select id from public.staff_profiles where auth_user_id = auth.uid()));
