-- Duplicate cleanup is recoverable: preserve the duplicate record and its
-- history while recording which canonical client it was merged into.
alter table public.client_master
  add column if not exists duplicate_of_client_id uuid references public.client_master(id) on delete set null;

create index if not exists idx_client_master_duplicate_of
  on public.client_master(duplicate_of_client_id)
  where duplicate_of_client_id is not null;
