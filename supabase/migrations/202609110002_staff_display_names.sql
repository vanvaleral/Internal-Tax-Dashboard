-- Keep legal/registration names separate from the short operational names shown as PICs.
alter table public.staff_profiles
  add column if not exists display_name text;

-- Existing staff remain usable until they choose a preferred display name.
update public.staff_profiles
set display_name = full_name
where display_name is null or btrim(display_name) = '';

alter table public.staff_profiles
  alter column display_name set not null;
