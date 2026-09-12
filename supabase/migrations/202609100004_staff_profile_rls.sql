-- Allow an authenticated user to complete only their own staff profile.
-- Supervisor/admin profile changes should use a protected server-side flow.

alter table public.staff_profiles enable row level security;

drop policy if exists staff_profiles_self_read on public.staff_profiles;
create policy staff_profiles_self_read
  on public.staff_profiles for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists staff_profiles_self_insert on public.staff_profiles;
create policy staff_profiles_self_insert
  on public.staff_profiles for insert
  to authenticated
  with check (auth_user_id = auth.uid());

drop policy if exists staff_profiles_self_update on public.staff_profiles;
create policy staff_profiles_self_update
  on public.staff_profiles for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
