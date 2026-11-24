create table public.allocation_draft_revisions (
  allocation_year integer not null check (allocation_year between 2000 and 2200),
  version integer not null check (version > 0),
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) <= 1000),
  published_by uuid references public.staff_profiles(id) on delete set null,
  published_by_name text not null,
  published_at timestamptz not null default now(),
  primary key (allocation_year,version)
);

alter table public.allocation_draft_revisions enable row level security;
revoke all on public.allocation_draft_revisions from public, anon, authenticated, service_role;
grant select, insert on public.allocation_draft_revisions to service_role;
