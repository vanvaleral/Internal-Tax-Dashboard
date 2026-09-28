-- Keep the existing annual_accounting JSONB workspace authoritative. Existing
-- rows may omit these optional fields; new values must be unique month indexes.
create or replace function public.annual_accounting_month_checklists_valid(workspace jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  item jsonb;
  field_name text;
  month_item jsonb;
  observed integer[];
  month_number integer;
begin
  if jsonb_typeof(workspace) <> 'array' then return false; end if;
  for item in select value from jsonb_array_elements(workspace) loop
    if jsonb_typeof(item) <> 'object' then return false; end if;
    foreach field_name in array array['technicalAdminMonths', 'dataMonths', 'reportPreparationMonths'] loop
      if item ? field_name then
        if jsonb_typeof(item -> field_name) <> 'array' then return false; end if;
        observed := array[]::integer[];
        for month_item in select value from jsonb_array_elements(item -> field_name) loop
          if jsonb_typeof(month_item) <> 'number' or month_item::text !~ '^([0-9]|10|11)$' then return false; end if;
          month_number := (month_item::text)::integer;
          if month_number = any(observed) then return false; end if;
          observed := array_append(observed, month_number);
        end loop;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

revoke all on function public.annual_accounting_month_checklists_valid(jsonb) from public, anon, authenticated;
grant execute on function public.annual_accounting_month_checklists_valid(jsonb) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.operational_workspace_state'::regclass
      and conname = 'annual_accounting_month_checklists_valid'
  ) then
    alter table public.operational_workspace_state
      add constraint annual_accounting_month_checklists_valid
      check (scope <> 'annual_accounting' or public.annual_accounting_month_checklists_valid(payload)) not valid;
  end if;
end;
$$;
