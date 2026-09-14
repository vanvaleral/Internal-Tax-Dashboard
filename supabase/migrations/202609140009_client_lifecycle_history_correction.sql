-- Preserve historical end dates for inactive clients rather than assigning the
-- latest import/update date as the date the engagement ended.
update public.client_master
set inactivated_at = engagement_end
where status = 'Inactive'
  and engagement_end is not null
  and (inactivated_at is null or inactivated_at > engagement_end);

create or replace function public.track_client_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if new.contract_started_at is null and new.engagement_start is not null then
    new.contract_started_at = new.engagement_start;
  end if;
  if TG_OP = 'INSERT' and new.status = 'Inactive' then
    new.inactivated_at = coalesce(new.inactivated_at, new.engagement_end, current_date);
  elsif TG_OP = 'UPDATE' and new.status = 'Inactive' then
    new.inactivated_at = coalesce(new.inactivated_at, new.engagement_end, old.inactivated_at, current_date);
  elsif new.status is distinct from 'Inactive' then
    new.inactivated_at = null;
  end if;
  return new;
end;
$$;
