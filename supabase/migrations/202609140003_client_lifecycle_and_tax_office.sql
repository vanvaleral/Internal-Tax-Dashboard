-- Contract lifecycle and regional registration data for management reporting.
alter table public.client_master
  add column if not exists contract_started_at date,
  add column if not exists inactivated_at date,
  add column if not exists tax_office_region text;

-- Existing records did not yet have lifecycle fields. Use their recorded
-- engagement/creation dates as a conservative historical baseline.
update public.client_master
set contract_started_at = coalesce(engagement_start, created_at::date)
where contract_started_at is null;

-- For previously inactive records, retain at least the known inactivation
-- year. Exact dates can be corrected later from the client record.
update public.client_master
set inactivated_at = date_trunc('year', coalesce(engagement_end, updated_at::date, created_at::date))::date
where status = 'Inactive' and inactivated_at is null;

create index if not exists idx_client_master_contract_started_at on public.client_master(contract_started_at);
create index if not exists idx_client_master_inactivated_at on public.client_master(inactivated_at);
create index if not exists idx_client_master_tax_office_region on public.client_master(tax_office_region);

create or replace function public.track_client_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if new.contract_started_at is null and new.engagement_start is not null then
    new.contract_started_at = new.engagement_start;
  end if;
  if TG_OP = 'INSERT' and new.status = 'Inactive' then
    new.inactivated_at = coalesce(new.inactivated_at, current_date);
  elsif TG_OP = 'UPDATE' and new.status = 'Inactive' and old.status is distinct from 'Inactive' then
    new.inactivated_at = current_date;
  elsif new.status is distinct from 'Inactive' then
    new.inactivated_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists client_master_track_lifecycle on public.client_master;
create trigger client_master_track_lifecycle
before insert or update on public.client_master
for each row execute function public.track_client_lifecycle();
