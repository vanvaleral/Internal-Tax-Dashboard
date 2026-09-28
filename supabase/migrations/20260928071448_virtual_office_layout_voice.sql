-- Additive office layout revision. Keep the legacy grid columns for older clients.
alter table public.virtual_office_profiles
 add column if not exists position_x double precision not null default 590 check (position_x between 0 and 1100),
 add column if not exists position_y double precision not null default 315 check (position_y between 0 and 600),
 add column if not exists seat_id text,
 add column if not exists activity text not null default 'idle' check (activity in ('idle','seated','working'));
create unique index if not exists virtual_office_occupied_seat on public.virtual_office_profiles (seat_id) where seat_id is not null;
create index if not exists virtual_office_presence_idx on public.virtual_office_profiles (last_seen_at);

-- Ephemeral WebRTC signaling. No audio/video media is stored in these tables.
create table if not exists public.virtual_office_voice_sessions (
 session_id uuid primary key,
 staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
 room text not null check (room in ('office','partner')),
 muted boolean not null default true,
 last_seen_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index if not exists virtual_office_voice_room_idx on public.virtual_office_voice_sessions(room,last_seen_at);
create index if not exists virtual_office_voice_staff_idx on public.virtual_office_voice_sessions(staff_profile_id);
create table if not exists public.virtual_office_voice_signals (
 id bigint generated always as identity primary key,
 sender_session_id uuid not null references public.virtual_office_voice_sessions(session_id) on delete cascade,
 recipient_session_id uuid not null references public.virtual_office_voice_sessions(session_id) on delete cascade,
 kind text not null check (kind in ('offer','answer','ice')),
 payload jsonb not null check (octet_length(payload::text) <= 40000),
 created_at timestamptz not null default now()
);
create index if not exists virtual_office_voice_inbox_idx on public.virtual_office_voice_signals(recipient_session_id,id);
create index if not exists virtual_office_voice_sender_idx on public.virtual_office_voice_signals(sender_session_id);
create index if not exists virtual_office_voice_expiry_idx on public.virtual_office_voice_signals(created_at);
alter table public.virtual_office_voice_sessions enable row level security;
alter table public.virtual_office_voice_signals enable row level security;
revoke all on public.virtual_office_voice_sessions, public.virtual_office_voice_signals from anon, authenticated;
revoke all on sequence public.virtual_office_voice_signals_id_seq from anon, authenticated;
grant all on public.virtual_office_voice_sessions, public.virtual_office_voice_signals to service_role;
grant usage, select on sequence public.virtual_office_voice_signals_id_seq to service_role;
