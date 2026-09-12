-- Add the Leader role and keep leadership access consistent with the UI.
alter table public.staff_profiles
  drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('staff', 'leader', 'supervisor', 'partner', 'admin'));

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
