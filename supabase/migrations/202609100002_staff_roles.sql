-- Staff profile fields used by invitation onboarding.
alter table public.staff_profiles
  add column if not exists role text not null default 'staff';

alter table public.staff_profiles
  drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('staff', 'supervisor', 'admin'));

create unique index if not exists idx_staff_profiles_auth_user_id
  on public.staff_profiles(auth_user_id)
  where auth_user_id is not null;
