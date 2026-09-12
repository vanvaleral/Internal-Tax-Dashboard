-- Additive foundation for the real client master.
-- This migration intentionally does not modify or delete the prototype tables.

create table if not exists public.client_master (
  id uuid primary key default gen_random_uuid(),
  client_code text not null unique,
  legal_name text not null,
  npwp text,
  industry text,
  address text,
  status text not null default 'Active' check (status in ('Active', 'Inactive', 'Proposal')),
  tax_pic_name text,
  accounting_pic_name text,
  monthly_fee numeric(18, 2),
  annual_fee numeric(18, 2),
  engagement_start date,
  engagement_end date,
  has_pph21 boolean not null default false,
  has_unifikasi boolean not null default false,
  has_pph25_pp55 boolean not null default false,
  has_pb1 boolean not null default false,
  has_ppn boolean not null default false,
  source_system text not null default 'manual',
  source_row_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_master_status on public.client_master(status);
create index if not exists idx_client_master_tax_pic on public.client_master(tax_pic_name);
create index if not exists idx_client_master_accounting_pic on public.client_master(accounting_pic_name);

create table if not exists public.client_master_activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.client_master(id) on delete cascade,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_client_master_activity_client on public.client_master_activity(client_id, created_at desc);

alter table public.client_master enable row level security;
alter table public.client_master_activity enable row level security;

drop policy if exists client_master_authenticated_read on public.client_master;
create policy client_master_authenticated_read
  on public.client_master for select
  to authenticated
  using (true);

drop policy if exists client_master_authenticated_write on public.client_master;
create policy client_master_authenticated_write
  on public.client_master for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists client_master_activity_authenticated_read on public.client_master_activity;
create policy client_master_activity_authenticated_read
  on public.client_master_activity for select
  to authenticated
  using (true);

drop policy if exists client_master_activity_authenticated_insert on public.client_master_activity;
create policy client_master_activity_authenticated_insert
  on public.client_master_activity for insert
  to authenticated
  with check (actor_user_id = auth.uid());

create or replace function public.touch_client_master_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_master_updated_at on public.client_master;
create trigger client_master_updated_at
  before update on public.client_master
  for each row execute function public.touch_client_master_updated_at();
