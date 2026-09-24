-- Preserve one client-master identity through Proposal -> Contract -> Active.
-- All fields are additive so existing client and proposal records remain intact.

alter table public.client_master
  add column if not exists responsible_person_name text,
  add column if not exists responsible_person_birth_place text,
  add column if not exists responsible_person_birth_date date,
  add column if not exists responsible_person_address text,
  add column if not exists notary_name text,
  add column if not exists notary_address text,
  add column if not exists deed_number text,
  add column if not exists deed_date date,
  add column if not exists contract_signed_at date;

alter table public.client_master drop constraint if exists client_master_status_check;
alter table public.client_master
  add constraint client_master_status_check
  check (status in ('Active', 'Inactive', 'Proposal', 'Contract'));

create index if not exists idx_client_master_pipeline_status
  on public.client_master(status, updated_at desc)
  where status in ('Proposal', 'Contract');
