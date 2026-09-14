-- Additive notification hardening. Existing announcements and inbox history remain intact.

alter table public.announcements add column if not exists event_key text;
alter table public.announcements add column if not exists source_type text;
alter table public.announcements add column if not exists source_id text;

create unique index if not exists announcements_sender_event_key_unique
  on public.announcements(sender_profile_id, event_key)
  where event_key is not null;

create table if not exists public.notification_delivery_log (
  id bigint generated always as identity primary key,
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  channel text not null default 'in_app' check (channel in ('in_app', 'web_push')),
  status text not null default 'delivered' check (status in ('queued', 'delivered', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (announcement_id, staff_profile_id, channel)
);

create index if not exists notification_delivery_log_status_idx
  on public.notification_delivery_log(status, updated_at);

alter table public.notification_delivery_log enable row level security;

drop policy if exists notification_delivery_log_read_self on public.notification_delivery_log;
create policy notification_delivery_log_read_self
  on public.notification_delivery_log for select to authenticated
  using (
    staff_profile_id = public.current_staff_profile_id()
    or exists (
      select 1 from public.staff_profiles
      where auth_user_id = auth.uid()
        and role in ('leader', 'supervisor', 'partner', 'admin')
    )
  );

create or replace function public.set_notification_delivery_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notification_delivery_log_updated_at on public.notification_delivery_log;
create trigger notification_delivery_log_updated_at
before update on public.notification_delivery_log
for each row execute function public.set_notification_delivery_updated_at();
