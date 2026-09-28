-- Virtual office data is reached through authenticated Next.js routes only.
create table if not exists public.virtual_office_profiles (
  staff_profile_id uuid primary key references public.staff_profiles(id) on delete cascade,
  avatar_color text not null default 'teal',
  desk_style text not null default 'plant',
  x integer not null default 4 check (x between 0 and 11),
  y integer not null default 4 check (y between 0 and 7),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_avatar_color check (avatar_color in ('teal','blue','coral','violet','gold')),
  constraint office_desk_style check (desk_style in ('plant','lamp','books','coffee'))
);

create table if not exists public.virtual_office_messages (
  id bigint generated always as identity primary key,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists virtual_office_messages_recent_idx on public.virtual_office_messages (created_at desc);

alter table public.virtual_office_profiles enable row level security;
alter table public.virtual_office_messages enable row level security;
revoke all on public.virtual_office_profiles, public.virtual_office_messages from anon, authenticated;
revoke all on sequence public.virtual_office_messages_id_seq from anon, authenticated;
