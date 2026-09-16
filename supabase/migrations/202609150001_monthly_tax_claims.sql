create table if not exists public.monthly_tax_claims (
  id uuid primary key default gen_random_uuid(),
  period_key text not null,
  client_id uuid references public.client_master(id) on delete set null,
  tax_pic_profile_id uuid not null references public.staff_profiles(id),
  accounting_pic_profile_id uuid references public.staff_profiles(id),
  created_by_profile_id uuid not null references public.staff_profiles(id),
  source_snapshot jsonb not null,
  draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_key, client_id)
);

create index if not exists monthly_tax_claims_owner_idx on public.monthly_tax_claims(tax_pic_profile_id, period_key);
alter table public.monthly_tax_claims enable row level security;
revoke all on table public.monthly_tax_claims from authenticated;

create or replace function public.set_monthly_tax_claim_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists monthly_tax_claims_updated_at on public.monthly_tax_claims;
create trigger monthly_tax_claims_updated_at before update on public.monthly_tax_claims
for each row execute function public.set_monthly_tax_claim_updated_at();
