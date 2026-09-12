-- `display_name` became required after the original Auth trigger was created.
-- Recreate the trigger function so every future Auth user receives both names.

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
