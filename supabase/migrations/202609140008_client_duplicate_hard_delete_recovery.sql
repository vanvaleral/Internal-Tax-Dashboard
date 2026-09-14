-- Duplicate cleanup removes the source record from client_master while retaining
-- a short-lived recovery snapshot for accidental bulk deletions.
create table if not exists public.client_master_duplicate_trash (
  original_client_id uuid primary key,
  canonical_client_id uuid,
  client_record jsonb not null,
  activity_records jsonb not null default '[]'::jsonb,
  deleted_at timestamptz not null default now(),
  deleted_by_profile_id uuid references public.staff_profiles(id)
);

create index if not exists idx_client_master_duplicate_trash_deleted_at
  on public.client_master_duplicate_trash(deleted_at);

alter table public.client_master_duplicate_trash enable row level security;
revoke all on table public.client_master_duplicate_trash from authenticated;
