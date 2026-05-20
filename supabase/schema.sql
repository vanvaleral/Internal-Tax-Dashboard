create extension if not exists "pgcrypto";

create type team_division as enum ('Tax Team', 'Accounting Team');
create type client_status as enum ('active', 'inactive');
create type compliance_status as enum (
  'Awaiting Client Data',
  'Ready to Process',
  'Submitted Temporary',
  'Waiting Revision Data',
  'Revised & Finalized',
  'Archived'
);
create type submission_type as enum ('none', 'temporary', 'final');
create type tax_type as enum (
  'PPh Payment',
  'PPh Reporting',
  'VAT Payment',
  'VAT Reporting',
  'Withholding Tax',
  'Other'
);

create table if not exists staff_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  full_name text not null,
  team_division team_division not null default 'Tax Team',
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  assigned_pic_id uuid references staff_profiles(id),
  team_division team_division not null default 'Tax Team',
  status client_status not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists client_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  tax_type tax_type not null,
  due_day integer not null check (due_day between 1 and 31),
  obligation_name text not null,
  is_active boolean not null default true,
  unique (client_id, tax_type, due_day, obligation_name)
);

create table if not exists tax_periods (
  id uuid primary key default gen_random_uuid(),
  period_month integer not null check (period_month between 1 and 12),
  period_year integer not null check (period_year between 2020 and 2100),
  starts_on date not null,
  ends_on date not null,
  unique (period_month, period_year)
);

create table if not exists compliance_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  tax_period_id uuid not null references tax_periods(id) on delete cascade,
  client_tax_profile_id uuid references client_tax_profiles(id),
  tax_type tax_type not null,
  assigned_pic_id uuid references staff_profiles(id),
  status compliance_status not null default 'Awaiting Client Data',
  submission_type submission_type not null default 'none',
  receipt_number text,
  revision_required boolean not null default false,
  follow_up_count integer not null default 0,
  last_follow_up_at timestamptz,
  revision_reason text,
  archive_notes text,
  due_date date not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (client_id, tax_period_id, tax_type, due_date)
);

create index if not exists idx_compliance_tasks_status on compliance_tasks(status);
create index if not exists idx_compliance_tasks_due_date on compliance_tasks(due_date);
create index if not exists idx_compliance_tasks_revision on compliance_tasks(revision_required);
create index if not exists idx_compliance_tasks_assigned_pic on compliance_tasks(assigned_pic_id);

create or replace function ensure_tax_period(p_target_date date)
returns uuid
language plpgsql
as $$
declare
  v_period_id uuid;
  v_month integer := extract(month from p_target_date);
  v_year integer := extract(year from p_target_date);
begin
  insert into tax_periods (period_month, period_year, starts_on, ends_on)
  values (
    v_month,
    v_year,
    date_trunc('month', p_target_date)::date,
    (date_trunc('month', p_target_date) + interval '1 month - 1 day')::date
  )
  on conflict (period_month, period_year) do nothing;

  select id into v_period_id
  from tax_periods
  where period_month = v_month and period_year = v_year;

  return v_period_id;
end;
$$;

create or replace function generate_monthly_compliance_tasks(p_target_date date default current_date)
returns integer
language plpgsql
as $$
declare
  v_period_id uuid;
  v_inserted integer := 0;
begin
  v_period_id := ensure_tax_period(p_target_date);

  with inserted as (
    insert into compliance_tasks (
      client_id,
      tax_period_id,
      client_tax_profile_id,
      tax_type,
      assigned_pic_id,
      due_date
    )
    select
      ctp.client_id,
      v_period_id,
      ctp.id,
      ctp.tax_type,
      c.assigned_pic_id,
      make_date(
        extract(year from p_target_date)::integer,
        extract(month from p_target_date)::integer,
        least(
          ctp.due_day,
          extract(day from (date_trunc('month', p_target_date) + interval '1 month - 1 day'))::integer
        )
      )
    from client_tax_profiles ctp
    join clients c on c.id = ctp.client_id
    where ctp.is_active = true
      and c.status = 'active'
      and c.team_division = 'Tax Team'
    on conflict (client_id, tax_period_id, tax_type, due_date) do nothing
    returning 1
  )
  select count(*) into v_inserted from inserted;

  return v_inserted;
end;
$$;

create or replace function adjust_follow_up_count(p_task_id uuid, p_delta integer)
returns compliance_tasks
language plpgsql
as $$
declare
  v_task compliance_tasks;
begin
  update compliance_tasks
  set
    follow_up_count = greatest(0, follow_up_count + p_delta),
    last_follow_up_at = case
      when p_delta > 0 then now()
      else last_follow_up_at
    end
  where id = p_task_id
  returning * into v_task;

  return v_task;
end;
$$;

create or replace view compliance_board as
select
  ct.id,
  c.id as client_id,
  c.name as client_name,
  c.team_division,
  tp.period_month,
  tp.period_year,
  ct.tax_type,
  coalesce(sp.full_name, 'Unassigned') as assigned_pic,
  ct.status,
  ct.submission_type,
  ct.receipt_number,
  ct.revision_required,
  ct.follow_up_count,
  ct.last_follow_up_at,
  ct.revision_reason,
  ct.due_date,
  ct.created_at,
  ct.completed_at,
  ct.due_date < current_date and ct.status not in ('Revised & Finalized', 'Archived') as is_overdue
from compliance_tasks ct
join clients c on c.id = ct.client_id
join tax_periods tp on tp.id = ct.tax_period_id
left join staff_profiles sp on sp.id = ct.assigned_pic_id;

insert into staff_profiles (id, full_name, team_division)
values
  ('00000000-0000-0000-0000-000000000101', 'Nadia', 'Tax Team'),
  ('00000000-0000-0000-0000-000000000102', 'Raka', 'Tax Team'),
  ('00000000-0000-0000-0000-000000000103', 'Mira', 'Tax Team')
on conflict do nothing;

insert into clients (id, name, assigned_pic_id, team_division, status)
values
  ('10000000-0000-0000-0000-000000000001', 'PT Arunika Sentosa', '00000000-0000-0000-0000-000000000101', 'Tax Team', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'CV Bumi Niaga', '00000000-0000-0000-0000-000000000102', 'Tax Team', 'active'),
  ('10000000-0000-0000-0000-000000000003', 'PT Nusa Prima Karya', '00000000-0000-0000-0000-000000000101', 'Tax Team', 'active'),
  ('10000000-0000-0000-0000-000000000004', 'PT Samudra Retail', '00000000-0000-0000-0000-000000000103', 'Tax Team', 'active')
on conflict do nothing;

insert into client_tax_profiles (client_id, tax_type, due_day, obligation_name)
values
  ('10000000-0000-0000-0000-000000000001', 'PPh Payment', 15, 'Monthly PPh payment'),
  ('10000000-0000-0000-0000-000000000001', 'PPh Reporting', 20, 'Monthly PPh reporting'),
  ('10000000-0000-0000-0000-000000000002', 'VAT Payment', 15, 'Monthly VAT payment'),
  ('10000000-0000-0000-0000-000000000002', 'VAT Reporting', 20, 'Monthly VAT reporting'),
  ('10000000-0000-0000-0000-000000000003', 'PPh Reporting', 20, 'Monthly PPh reporting'),
  ('10000000-0000-0000-0000-000000000004', 'VAT Reporting', 20, 'Monthly VAT reporting')
on conflict do nothing;

select generate_monthly_compliance_tasks(current_date);
