-- Compatibility bridge for projects that applied the original client-master
-- migration before the later export/import and lifecycle additions existed.
alter table public.client_master
  add column if not exists notes text,
  add column if not exists partner_name text,
  add column if not exists supervisor_name text,
  add column if not exists service_package text,
  add column if not exists proposal_status text,
  add column if not exists company_form text,
  add column if not exists contract_started_at date,
  add column if not exists inactivated_at date,
  add column if not exists tax_office_region text;

alter table public.staff_profiles
  add column if not exists employment_title text,
  add column if not exists claim_code_hash text,
  add column if not exists claimed_at timestamptz,
  add column if not exists directory_active boolean not null default true;

create unique index if not exists idx_staff_profiles_claim_code_hash
  on public.staff_profiles(claim_code_hash)
  where claim_code_hash is not null;

create index if not exists idx_client_master_contract_started_at on public.client_master(contract_started_at);
create index if not exists idx_client_master_inactivated_at on public.client_master(inactivated_at);
create index if not exists idx_client_master_tax_office_region on public.client_master(tax_office_region);

-- Add Bagus to existing pending directories without changing the immutable
-- profile ID when Bagus already has an Auth-linked staff profile.
with roster(full_name, display_name, employment_title, team_division, role, claim_code_hash) as (
  values ('Bagus', 'Bagus', 'Junior Tax Associate', 'Tax Team', 'staff', '0388e1c9da1aac97ba510f7b7b59267fe17d99d982bcc3d938da9e8367f73eb0')
)
update public.staff_profiles staff
set
  full_name = roster.full_name,
  display_name = roster.display_name,
  employment_title = roster.employment_title,
  team_division = roster.team_division::team_division,
  role = roster.role,
  directory_active = true,
  claim_code_hash = case when staff.auth_user_id is null then roster.claim_code_hash else null end,
  claimed_at = case when staff.auth_user_id is null then null else coalesce(staff.claimed_at, now()) end
from roster
where staff.id = (
  select candidate.id
  from public.staff_profiles candidate
  where lower(coalesce(candidate.full_name, '')) = 'bagus'
     or lower(coalesce(candidate.display_name, '')) = 'bagus'
  order by (candidate.auth_user_id is not null) desc, candidate.created_at asc
  limit 1
);

insert into public.staff_profiles (full_name, display_name, employment_title, team_division, role, claim_code_hash, directory_active)
select 'Bagus', 'Bagus', 'Junior Tax Associate', 'Tax Team'::team_division, 'staff', '0388e1c9da1aac97ba510f7b7b59267fe17d99d982bcc3d938da9e8367f73eb0', true
where not exists (
  select 1 from public.staff_profiles
  where lower(coalesce(full_name, '')) = 'bagus' or lower(coalesce(display_name, '')) = 'bagus'
);
