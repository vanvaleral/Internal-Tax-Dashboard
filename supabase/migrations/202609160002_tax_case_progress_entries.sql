-- Immutable, attributed progress notes for a formal Case. Daily tasks remain
-- separate records and are joined by case_id when a Himbauan is expanded.
create table if not exists public.tax_case_progress_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tax_cases(id) on delete cascade,
  entry text not null check (char_length(btrim(entry)) between 1 and 1000),
  created_by_profile_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_tax_case_progress_entries_case_created
  on public.tax_case_progress_entries(case_id, created_at desc);

alter table public.tax_case_progress_entries enable row level security;
revoke all on table public.tax_case_progress_entries from authenticated;
