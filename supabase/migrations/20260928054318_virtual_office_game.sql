-- Optional mini game. This table has no foreign keys into office or tax records.
create table if not exists public.virtual_office_game (
  id integer primary key default 1 check (id = 1),
  round_number integer not null default 1,
  progress integer not null default 0 check (progress between 0 and 12),
  completed_rounds integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.virtual_office_game (id) values (1) on conflict (id) do nothing;
alter table public.virtual_office_game enable row level security;
revoke all on public.virtual_office_game from anon, authenticated;
