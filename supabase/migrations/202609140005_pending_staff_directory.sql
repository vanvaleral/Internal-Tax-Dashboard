-- A staff directory may exist before each person has a Supabase Auth account.
-- Client PIC assignments reference these durable profile IDs from day one.
alter table public.staff_profiles
  add column if not exists employment_title text,
  add column if not exists claim_code_hash text,
  add column if not exists claimed_at timestamptz,
  add column if not exists directory_active boolean not null default true;

create unique index if not exists idx_staff_profiles_claim_code_hash
  on public.staff_profiles(claim_code_hash)
  where claim_code_hash is not null;

-- The claim-code hashes correspond to one-time codes shared privately by the
-- Partner/Supervisor. Raw codes are deliberately not stored in this migration.
with roster(full_name, display_name, employment_title, team_division, role, claim_code_hash) as (
  values
    ('Dewa Sumerta', 'Dewa', 'Partner', 'Tax Team', 'partner', '7d50ebc65a4e5b5c7612d22fa19aa674ed30de1925335194337213779910fd97'),
    ('Ivan Sadhana', 'Ivan', 'Supervisor', 'Accounting Team', 'supervisor', 'bc43bf75d9c716a3f53e1d69f35ad56d0acd208a8d05e15257e9867c3fe335c1'),
    ('Ita', 'Ita', 'Leader', 'Tax Team', 'leader', '81971f32f02c667ff3395e09569f100055d98b5126a0c0ed4fbb7bd38e4c552c'),
    ('Cemari', 'Cemari', 'Leader', 'Accounting Team', 'leader', 'f252e2bed2276a6933d3afe866d51a6776f3f7deabce36e975c2f4bf713096e0'),
    ('Okta', 'Okta', 'Senior Tax Associate', 'Tax Team', 'staff', 'a0698958c9616ab8f4438b208b65a5463cfd133ac8a1276d8043b048df5c862f'),
    ('Harry', 'Harry', 'Senior Tax Associate', 'Tax Team', 'staff', 'e3655af5e3a611f9b50e6790de9ca0a71d3a0575e31cb6bc24472baf04bd59d7'),
    ('Denny', 'Denny', 'Senior Tax Associate', 'Tax Team', 'staff', '5a6a63fa0184db0e5d01617789c42db6062f509e21215ac5f54b931fc0e43549'),
    ('Dewayu', 'Dewayu', 'Senior Accounting Associate', 'Accounting Team', 'staff', '9fe66da8e93f8a532855f94bdba7cb1221268cf9076c7855955fc751fc993807'),
    ('Tantri', 'Tantri', 'Senior Accounting Associate', 'Accounting Team', 'staff', 'ea4ecf869f4dd9cb2f1f101cfb8cab7130b035cfc404e354c54f2fe199d33885'),
    ('Dina', 'Dina', 'Junior Accounting Associate', 'Accounting Team', 'staff', '2d71816fcd62aea5582e99852947aa97c5add636330001877d8c60969ec28033'),
    ('Dimas', 'Dimas', 'Junior Accounting Associate', 'Tax Team', 'staff', 'c931bfad9e8c6e13f9e59db112bca39ff5c5ee248d62966c20533393437f7b94'),
    ('Devira', 'Devira', 'Junior Tax Associate', 'Tax Team', 'staff', '6550350cd93596ac9ae4b80866b60b1f1fc835900b34c2a8abd53bf250623431'),
    ('Budi', 'Budi', 'Junior Tax Associate', 'Tax Team', 'staff', 'e90f3c70b0c9baca0a4327f0c0fd36775ffc535bc6d107fd5d3023adbe61bc51'),
    ('Dinar', 'Dinar', 'Junior Tax Associate', 'Tax Team', 'staff', '05b44b4c699cc87d3c6697d964b5dd26e04248ddf1da804d8edb2a23cd080a54')
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
  where lower(coalesce(candidate.full_name, '')) = lower(roster.full_name)
     or lower(coalesce(candidate.display_name, '')) = lower(roster.display_name)
  order by (candidate.auth_user_id is not null) desc, candidate.created_at asc
  limit 1
);

with roster(full_name, display_name, employment_title, team_division, role, claim_code_hash) as (
  values
    ('Dewa Sumerta', 'Dewa', 'Partner', 'Tax Team', 'partner', '7d50ebc65a4e5b5c7612d22fa19aa674ed30de1925335194337213779910fd97'),
    ('Ivan Sadhana', 'Ivan', 'Supervisor', 'Accounting Team', 'supervisor', 'bc43bf75d9c716a3f53e1d69f35ad56d0acd208a8d05e15257e9867c3fe335c1'),
    ('Ita', 'Ita', 'Leader', 'Tax Team', 'leader', '81971f32f02c667ff3395e09569f100055d98b5126a0c0ed4fbb7bd38e4c552c'),
    ('Cemari', 'Cemari', 'Leader', 'Accounting Team', 'leader', 'f252e2bed2276a6933d3afe866d51a6776f3f7deabce36e975c2f4bf713096e0'),
    ('Okta', 'Okta', 'Senior Tax Associate', 'Tax Team', 'staff', 'a0698958c9616ab8f4438b208b65a5463cfd133ac8a1276d8043b048df5c862f'),
    ('Harry', 'Harry', 'Senior Tax Associate', 'Tax Team', 'staff', 'e3655af5e3a611f9b50e6790de9ca0a71d3a0575e31cb6bc24472baf04bd59d7'),
    ('Denny', 'Denny', 'Senior Tax Associate', 'Tax Team', 'staff', '5a6a63fa0184db0e5d01617789c42db6062f509e21215ac5f54b931fc0e43549'),
    ('Dewayu', 'Dewayu', 'Senior Accounting Associate', 'Accounting Team', 'staff', '9fe66da8e93f8a532855f94bdba7cb1221268cf9076c7855955fc751fc993807'),
    ('Tantri', 'Tantri', 'Senior Accounting Associate', 'Accounting Team', 'staff', 'ea4ecf869f4dd9cb2f1f101cfb8cab7130b035cfc404e354c54f2fe199d33885'),
    ('Dina', 'Dina', 'Junior Accounting Associate', 'Accounting Team', 'staff', '2d71816fcd62aea5582e99852947aa97c5add636330001877d8c60969ec28033'),
    ('Dimas', 'Dimas', 'Junior Accounting Associate', 'Tax Team', 'staff', 'c931bfad9e8c6e13f9e59db112bca39ff5c5ee248d62966c20533393437f7b94'),
    ('Devira', 'Devira', 'Junior Tax Associate', 'Tax Team', 'staff', '6550350cd93596ac9ae4b80866b60b1f1fc835900b34c2a8abd53bf250623431'),
    ('Budi', 'Budi', 'Junior Tax Associate', 'Tax Team', 'staff', 'e90f3c70b0c9baca0a4327f0c0fd36775ffc535bc6d107fd5d3023adbe61bc51'),
    ('Dinar', 'Dinar', 'Junior Tax Associate', 'Tax Team', 'staff', '05b44b4c699cc87d3c6697d964b5dd26e04248ddf1da804d8edb2a23cd080a54')
)
insert into public.staff_profiles (full_name, display_name, employment_title, team_division, role, claim_code_hash)
select roster.full_name, roster.display_name, roster.employment_title, roster.team_division::team_division, roster.role, roster.claim_code_hash
from roster
where not exists (
  select 1
  from public.staff_profiles staff
  where lower(coalesce(staff.full_name, '')) = lower(roster.full_name)
     or lower(coalesce(staff.display_name, '')) = lower(roster.display_name)
);

-- Archive legacy demo/test profiles from the selectable directory without
-- deleting them or breaking any historical foreign-key relationships.
update public.staff_profiles set directory_active = false;

with roster(full_name, display_name) as (
  values
    ('Dewa Sumerta', 'Dewa'), ('Ivan Sadhana', 'Ivan'), ('Ita', 'Ita'), ('Cemari', 'Cemari'),
    ('Okta', 'Okta'), ('Harry', 'Harry'), ('Denny', 'Denny'), ('Dewayu', 'Dewayu'),
    ('Tantri', 'Tantri'), ('Dina', 'Dina'), ('Dimas', 'Dimas'), ('Devira', 'Devira'),
    ('Budi', 'Budi'), ('Dinar', 'Dinar')
)
update public.staff_profiles staff
set directory_active = true
from roster
where staff.id = (
  select candidate.id
  from public.staff_profiles candidate
  where lower(coalesce(candidate.full_name, '')) = lower(roster.full_name)
     or lower(coalesce(candidate.display_name, '')) = lower(roster.display_name)
  order by (candidate.auth_user_id is not null) desc, candidate.created_at asc
  limit 1
);
