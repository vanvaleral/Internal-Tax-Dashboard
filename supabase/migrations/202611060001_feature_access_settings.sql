-- Additive: no staff roles, PIC ownership or operational records are rewritten.
begin;
create table public.feature_access_settings (
  id boolean primary key default true check (id),
  policy jsonb not null,
  version integer not null default 1 check (version > 0),
  updated_by_profile_id uuid references public.staff_profiles(id),
  updated_at timestamptz not null default now()
);
create table public.feature_access_audit (
  id bigint generated always as identity primary key,
  actor_profile_id uuid not null references public.staff_profiles(id),
  version integer not null unique,
  before_policy jsonb not null,
  after_policy jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.feature_access_settings enable row level security;
alter table public.feature_access_audit enable row level security;
revoke all on public.feature_access_settings, public.feature_access_audit from public, anon, authenticated;
grant select on public.feature_access_settings to authenticated;
create policy feature_settings_active_read on public.feature_access_settings for select to authenticated
using (exists (select 1 from public.staff_profiles where auth_user_id = (select auth.uid()) and directory_active = true));
grant select, insert, update on public.feature_access_settings to service_role;
grant select, insert on public.feature_access_audit to service_role;
grant usage, select on sequence public.feature_access_audit_id_seq to service_role;

insert into public.feature_access_settings (policy)
select jsonb_object_agg(tier, rules) from (
  select tier, jsonb_object_agg(feature, jsonb_build_object('mode', case when feature in ('operations','management','allocation') then 'hidden' else 'enabled' end, 'message', '')) rules
  from unnest(array['associate','leader']) tier cross join unnest(array['operations','cases','myWork','clients','management','allocation','notifications','profile']) feature
  group by tier
) defaults;

create function public.save_feature_access_settings(actor_id uuid, expected_version integer, next_policy jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare prior jsonb; current_version integer; tier text; feature text; rule jsonb;
begin
  if not exists (select 1 from public.staff_profiles where id = actor_id and directory_active = true and role in ('supervisor','partner','admin')) then
    raise exception 'Supervisor or Partner required' using errcode = '42501';
  end if;
  if jsonb_typeof(next_policy) <> 'object' or (select count(*) from jsonb_object_keys(next_policy)) <> 2 or not (next_policy ?& array['associate','leader']) then raise exception 'Invalid access policy'; end if;
  foreach tier in array array['associate','leader'] loop
    if jsonb_typeof(next_policy->tier) <> 'object' or (select count(*) from jsonb_object_keys(next_policy->tier)) <> 8 then raise exception 'Invalid menus'; end if;
    foreach feature in array array['operations','cases','myWork','clients','management','allocation','notifications','profile'] loop
      rule := next_policy->tier->feature;
      if rule is null or jsonb_typeof(rule) <> 'object' or (select count(*) from jsonb_object_keys(rule)) <> 2 or not (rule ?& array['mode','message'])
        or jsonb_typeof(rule->'mode') <> 'string' or rule->>'mode' not in ('hidden','enabled','preview','maintenance') or jsonb_typeof(rule->'message') <> 'string' or length(rule->>'message') > 400
        or (feature = 'profile' and rule->>'mode' <> 'enabled') or (rule->>'mode' in ('preview','maintenance') and length(trim(rule->>'message')) = 0) then raise exception 'Invalid feature rule'; end if;
    end loop;
  end loop;
  select policy, version into prior, current_version from public.feature_access_settings where id = true for update;
  if current_version is distinct from expected_version then raise exception 'Settings changed; reload' using errcode = '40001'; end if;
  update public.feature_access_settings set policy = next_policy, version = current_version + 1, updated_by_profile_id = actor_id, updated_at = now() where id = true;
  insert into public.feature_access_audit (actor_profile_id, version, before_policy, after_policy) values (actor_id, current_version + 1, prior, next_policy);
  return current_version + 1;
end;
$$;
revoke all on function public.save_feature_access_settings(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_feature_access_settings(uuid, integer, jsonb) to service_role;

-- Restrictive policies also guard direct authenticated PostgREST requests. These
-- are additional gates, not replacements for the existing ownership policies.
create function public.feature_is_available(feature_name text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce((select case
    when role in ('supervisor','partner','admin') then true
    when feature_name not in ('operations','cases','myWork','clients','management','allocation','notifications','profile') then false
    else coalesce((select policy -> (case when role = 'leader' then 'leader' else 'associate' end) -> feature_name ->> 'mode'
      from public.feature_access_settings where id = true), case when feature_name in ('operations','management','allocation') then 'hidden' else 'enabled' end) in ('enabled','preview') end
    from public.staff_profiles where auth_user_id = (select auth.uid()) and directory_active = true), false);
$$;
revoke all on function public.feature_is_available(text) from public, anon, authenticated;
grant execute on function public.feature_is_available(text) to authenticated, service_role;
do $$
declare item record;
begin
  for item in select * from (values
    ('tax_cases','cases'), ('tax_case_progress_entries','cases'),
    ('my_work_tasks','myWork'), ('my_work_task_assignees','myWork'), ('my_work_task_preferences','myWork'),
    ('operational_workspace_state','operations'), ('annual_sheet_columns','operations'), ('monthly_tax_claims','operations'),
    ('announcements','notifications'), ('announcement_recipients','notifications')
  ) as guards(table_name, feature) loop
    if to_regclass('public.' || item.table_name) is not null then
      execute format('revoke all on public.%I from anon', item.table_name);
      execute format('revoke truncate, trigger, references on public.%I from authenticated', item.table_name);
      execute format('create policy feature_access_required on public.%I as restrictive for all to authenticated using ((select public.feature_is_available(%L))) with check ((select public.feature_is_available(%L)))', item.table_name, item.feature, item.feature);
    end if;
  end loop;
end $$;
commit;
