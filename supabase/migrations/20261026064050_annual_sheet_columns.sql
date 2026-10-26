-- Additive metadata only. Annual records remain in operational_workspace_state.
create table if not exists public.annual_sheet_columns (
  team text not null check (team in ('accounting', 'tax')),
  field text not null check (field ~ '^custom_[a-f0-9]{32}$'),
  title text not null check (char_length(title) between 1 and 48),
  type text not null check (type in ('text', 'number', 'date')),
  width integer not null check (width between 80 and 400),
  created_by_profile_id uuid not null references public.staff_profiles(id),
  created_at timestamptz not null default now(),
  primary key (team, field)
);
create unique index if not exists annual_sheet_columns_title_idx on public.annual_sheet_columns(team, lower(title));
alter table public.annual_sheet_columns enable row level security;
revoke all on public.annual_sheet_columns from public, anon, authenticated;
grant select, insert on public.annual_sheet_columns to service_role;
comment on table public.annual_sheet_columns is 'Leadership-managed annual sheet schema; API authentication and authorization required. Created metadata is append-only.';
