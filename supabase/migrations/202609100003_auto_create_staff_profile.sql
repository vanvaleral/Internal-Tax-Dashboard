-- Keep every Supabase Auth user linked to an application staff profile.
-- The profile starts as staff; supervisors/admins are promoted separately.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.staff_profiles (auth_user_id, full_name, display_name, team_division, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), 'New user'),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1), 'New user'),
    'Tax Team',
    'staff'
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill profiles for users created before this trigger was installed.
insert into public.staff_profiles (auth_user_id, full_name, display_name, team_division, role)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1), 'Existing user'),
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1), 'Existing user'),
  'Tax Team',
  'staff'
from auth.users u
where not exists (
  select 1 from public.staff_profiles sp where sp.auth_user_id = u.id
);
