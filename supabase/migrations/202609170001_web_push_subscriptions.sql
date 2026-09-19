-- Browser push endpoints are private credentials and are only accessed by
-- authenticated server routes through the service role.
create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists web_push_subscriptions_profile_idx
  on public.web_push_subscriptions(staff_profile_id);

alter table public.web_push_subscriptions enable row level security;
revoke all on table public.web_push_subscriptions from public, anon, authenticated;
grant all on table public.web_push_subscriptions to service_role;
