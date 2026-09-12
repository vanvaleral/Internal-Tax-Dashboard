alter table public.staff_profiles
  add column if not exists username text;

create unique index if not exists idx_staff_profiles_username_lower
  on public.staff_profiles (lower(username))
  where username is not null;
