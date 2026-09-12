-- Fields needed to preserve the cleaned List Klien workbook during import.
alter table public.client_master add column if not exists source_status text;
alter table public.client_master add column if not exists difficulties integer;
alter table public.client_master add column if not exists kpp text;
alter table public.client_master add column if not exists contract_type text;
alter table public.client_master add column if not exists engagement_start_year integer;
alter table public.client_master add column if not exists engagement_end_year integer;
alter table public.client_master add column if not exists dpp numeric(18, 2);
alter table public.client_master add column if not exists ppn_amount numeric(18, 2);
alter table public.client_master add column if not exists pph23_amount numeric(18, 2);
alter table public.client_master add column if not exists invoice_amount numeric(18, 2);
alter table public.client_master add column if not exists annual_fee_percentage numeric(8, 5);
alter table public.client_master add column if not exists previous_tax_pic_name text;
alter table public.client_master add column if not exists previous_accounting_pic_name text;
alter table public.client_master add column if not exists next_tax_pic_name text;
alter table public.client_master add column if not exists next_accounting_pic_name text;

create index if not exists idx_client_master_source_row_key on public.client_master(source_row_key);
