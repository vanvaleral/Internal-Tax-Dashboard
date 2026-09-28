-- Access is removed after 14 days; the staff profile remains for historical FKs.
alter table public.staff_profiles
  add column if not exists archived_at timestamptz,
  add column if not exists access_deletion_started_at timestamptz,
  add column if not exists access_deleted_at timestamptz;

create index if not exists staff_profiles_access_retention_idx
  on public.staff_profiles (archived_at)
  where directory_active = false and archived_at is not null and access_deleted_at is null;
