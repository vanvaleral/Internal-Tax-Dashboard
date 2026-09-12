-- Formal case registers are additive; existing tax_cases remain available.
alter table public.tax_cases add column if not exists case_category text not null default 'Himbauan'
  check (case_category in ('Himbauan', 'Pemeriksaan'));
alter table public.tax_cases add column if not exists letter_number text;
alter table public.tax_cases add column if not exists letter_date date;
alter table public.tax_cases add column if not exists received_date date;
alter table public.tax_cases add column if not exists subject text;
alter table public.tax_cases add column if not exists tax_year text;
alter table public.tax_cases add column if not exists inspector_pic text;
alter table public.tax_cases add column if not exists sph_p_date date;
alter table public.tax_cases add column if not exists completion_date date;
alter table public.tax_cases add column if not exists completion_notes text;

update public.tax_cases
set case_category = case when lower(case_type) = 'pemeriksaan' then 'Pemeriksaan' else 'Himbauan' end
where case_category is null or case_category = 'Himbauan';

create index if not exists idx_tax_cases_category on public.tax_cases(case_category);
