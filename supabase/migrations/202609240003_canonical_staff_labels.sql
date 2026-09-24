-- Normalize current operational labels from permanent staff profile IDs.
-- Historical allocation rows retain the labels recorded at that time; their
-- profile IDs remain authoritative even if a display name changes later.

with staff_aliases as (
  select alias_name, min(id::text)::uuid as id
  from (
    select id, lower(btrim(display_name)) as alias_name from public.staff_profiles
    union
    select id, lower(btrim(full_name)) as alias_name from public.staff_profiles
  ) aliases
  where alias_name <> ''
  group by alias_name
  having count(distinct id) = 1
)
update public.client_master client
set tax_pic_profile_id = staff.id
from staff_aliases staff
where client.tax_pic_profile_id is null
  and lower(btrim(client.tax_pic_name)) = staff.alias_name;

with staff_aliases as (
  select alias_name, min(id::text)::uuid as id
  from (
    select id, lower(btrim(display_name)) as alias_name from public.staff_profiles
    union
    select id, lower(btrim(full_name)) as alias_name from public.staff_profiles
  ) aliases
  where alias_name <> ''
  group by alias_name
  having count(distinct id) = 1
)
update public.client_master client
set accounting_pic_profile_id = staff.id
from staff_aliases staff
where client.accounting_pic_profile_id is null
  and lower(btrim(client.accounting_pic_name)) = staff.alias_name;

update public.client_master client
set tax_pic_name = coalesce(nullif(btrim(staff.display_name), ''), staff.full_name)
from public.staff_profiles staff
where client.tax_pic_profile_id = staff.id
  and client.tax_pic_name is distinct from coalesce(nullif(btrim(staff.display_name), ''), staff.full_name);

update public.client_master client
set accounting_pic_name = coalesce(nullif(btrim(staff.display_name), ''), staff.full_name)
from public.staff_profiles staff
where client.accounting_pic_profile_id = staff.id
  and client.accounting_pic_name is distinct from coalesce(nullif(btrim(staff.display_name), ''), staff.full_name);

update public.tax_cases tax_case
set tax_pic_name = coalesce(nullif(btrim(staff.display_name), ''), staff.full_name)
from public.staff_profiles staff
where tax_case.tax_pic_profile_id = staff.id
  and tax_case.tax_pic_name is distinct from coalesce(nullif(btrim(staff.display_name), ''), staff.full_name);

update public.tax_cases tax_case
set accounting_pic_name = coalesce(nullif(btrim(staff.display_name), ''), staff.full_name)
from public.staff_profiles staff
where tax_case.accounting_pic_profile_id = staff.id
  and tax_case.accounting_pic_name is distinct from coalesce(nullif(btrim(staff.display_name), ''), staff.full_name);
