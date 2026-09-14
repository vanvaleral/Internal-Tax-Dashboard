-- Recoverable deletion: operational records remain restorable for 72 hours.
alter table public.tax_cases
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_profile_id uuid references public.staff_profiles(id);

create index if not exists idx_tax_cases_deleted_at on public.tax_cases(deleted_at)
  where deleted_at is not null;

-- A recipient can hide an announcement only from their own history. The
-- announcement remains available to every other recipient.
create table if not exists public.announcement_recipient_trash (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (announcement_id, staff_profile_id)
);

create index if not exists idx_announcement_recipient_trash_deleted_at
  on public.announcement_recipient_trash(deleted_at);

alter table public.announcement_recipient_trash enable row level security;
drop policy if exists announcement_recipient_trash_self on public.announcement_recipient_trash;
create policy announcement_recipient_trash_self on public.announcement_recipient_trash
  for all to authenticated
  using (staff_profile_id in (select id from public.staff_profiles where auth_user_id = auth.uid()))
  with check (staff_profile_id in (select id from public.staff_profiles where auth_user_id = auth.uid()));

-- Direct client reads never expose soft-deleted cases. Restore and purge run
-- through the audited server routes using the service role.
drop policy if exists tax_cases_read_scope on public.tax_cases;
create policy tax_cases_read_scope on public.tax_cases for select to authenticated
  using (
    deleted_at is null
    and (public.current_user_is_leadership() or tax_pic_name = public.current_staff_display_name() or accounting_pic_name = public.current_staff_display_name())
  );
