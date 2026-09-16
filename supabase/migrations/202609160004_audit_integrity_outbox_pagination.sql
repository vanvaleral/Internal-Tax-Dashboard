begin;

-- F12: preserve every relationship moved during duplicate-client cleanup.
alter table public.client_master_duplicate_trash
  add column if not exists relationship_records jsonb not null default '{}'::jsonb;

create or replace function public.merge_duplicate_clients(p_plans jsonb, p_actor_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  plan jsonb;
  canonical_id uuid;
  duplicate_id uuid;
  merged_count integer := 0;
  group_count integer := 0;
begin
  if not exists (
    select 1 from public.staff_profiles
    where id = p_actor_profile_id and directory_active is true
      and lower(role) in ('leader', 'supervisor', 'partner', 'admin')
  ) then raise exception 'Leadership access is required'; end if;

  for plan in select value from jsonb_array_elements(coalesce(p_plans, '[]'::jsonb)) loop
    canonical_id := (plan->>'canonicalId')::uuid;
    if not exists (select 1 from public.client_master where id = canonical_id) then
      raise exception 'Canonical client % was not found', canonical_id;
    end if;
    group_count := group_count + 1;

    for duplicate_id in select value::uuid from jsonb_array_elements_text(plan->'duplicateIds') loop
      if duplicate_id = canonical_id then raise exception 'A client cannot merge into itself'; end if;
      if not exists (select 1 from public.client_master where id = duplicate_id) then
        raise exception 'Duplicate client % was not found', duplicate_id;
      end if;

      insert into public.client_master_duplicate_trash (
        original_client_id, canonical_client_id, client_record, activity_records,
        relationship_records, deleted_by_profile_id, deleted_at
      )
      select duplicate_id, canonical_id, to_jsonb(client),
        coalesce((select jsonb_agg(to_jsonb(activity)) from public.client_master_activity activity where activity.client_id = duplicate_id), '[]'::jsonb),
        jsonb_build_object(
          'tax_case_ids', coalesce((select jsonb_agg(id) from public.tax_cases where client_id = duplicate_id), '[]'::jsonb),
          'monthly_tax_claim_ids', coalesce((select jsonb_agg(id) from public.monthly_tax_claims where client_id = duplicate_id), '[]'::jsonb)
        ), p_actor_profile_id, now()
      from public.client_master client where client.id = duplicate_id
      on conflict (original_client_id) do update set
        canonical_client_id = excluded.canonical_client_id,
        client_record = excluded.client_record,
        activity_records = excluded.activity_records,
        relationship_records = excluded.relationship_records,
        deleted_by_profile_id = excluded.deleted_by_profile_id,
        deleted_at = now();

      update public.tax_cases set client_id = canonical_id where client_id = duplicate_id;
      update public.monthly_tax_claims set client_id = canonical_id where client_id = duplicate_id;
      update public.client_master_activity set client_id = canonical_id where client_id = duplicate_id;
      delete from public.client_master where id = duplicate_id;
      merged_count := merged_count + 1;
    end loop;
  end loop;
  return jsonb_build_object('deleted', merged_count, 'groups', group_count);
end;
$$;
revoke all on function public.merge_duplicate_clients(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.merge_duplicate_clients(jsonb, uuid) to service_role;

create or replace function public.restore_merged_client(p_original_client_id uuid, p_actor_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  backup public.client_master_duplicate_trash%rowtype;
begin
  if not exists (
    select 1 from public.staff_profiles where id = p_actor_profile_id and directory_active is true
      and lower(role) in ('leader', 'supervisor', 'partner', 'admin')
  ) then raise exception 'Leadership access is required'; end if;
  select * into backup from public.client_master_duplicate_trash
    where original_client_id = p_original_client_id and deleted_at >= now() - interval '3 days' for update;
  if not found then raise exception 'Recovery period expired or backup was not found'; end if;
  if exists (select 1 from public.client_master where id = p_original_client_id) then raise exception 'Original client already exists'; end if;

  insert into public.client_master select (jsonb_populate_record(null::public.client_master, backup.client_record)).*;
  update public.tax_cases set client_id = p_original_client_id
    where client_id = backup.canonical_client_id
      and id in (select value::text::uuid from jsonb_array_elements_text(backup.relationship_records->'tax_case_ids'));
  update public.monthly_tax_claims set client_id = p_original_client_id
    where client_id = backup.canonical_client_id
      and id in (select value::text::uuid from jsonb_array_elements_text(backup.relationship_records->'monthly_tax_claim_ids'));
  update public.client_master_activity set client_id = p_original_client_id
    where client_id = backup.canonical_client_id
      and id in (select (value->>'id')::uuid from jsonb_array_elements(backup.activity_records));
  delete from public.client_master_duplicate_trash where original_client_id = p_original_client_id;
  return jsonb_build_object('restored', p_original_client_id, 'canonicalId', backup.canonical_client_id);
end;
$$;
revoke all on function public.restore_merged_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_merged_client(uuid, uuid) to service_role;

-- F13/F15: immutable task completion history and authoritative point attribution.
alter table public.my_work_tasks
  add column if not exists completed_by_profile_id uuid references public.staff_profiles(id);

create table if not exists public.my_work_task_completion_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.my_work_tasks(id) on delete cascade,
  actor_profile_id uuid not null references public.staff_profiles(id),
  event_type text not null check (event_type in ('completed', 'reopened')),
  completion_cycle integer not null check (completion_cycle > 0),
  occurred_at timestamptz not null default now(),
  unique (task_id, event_type, completion_cycle)
);
create index if not exists my_work_completion_events_task_idx
  on public.my_work_task_completion_events(task_id, occurred_at desc);
alter table public.my_work_task_completion_events enable row level security;
revoke all on table public.my_work_task_completion_events from authenticated;

create table if not exists public.performance_publications (
  period_key text primary key,
  snapshot jsonb not null,
  published_by_profile_id uuid not null references public.staff_profiles(id),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.performance_publications enable row level security;
revoke all on table public.performance_publications from authenticated;

-- F16: delivery work survives the request that created the announcement.
alter table public.notification_delivery_log
  add column if not exists next_attempt_at timestamptz not null default now();
alter table public.notification_delivery_log
  add column if not exists max_attempts integer not null default 8 check (max_attempts > 0);
alter table public.notification_delivery_log
  add column if not exists completed_at timestamptz;
create index if not exists notification_delivery_retry_idx
  on public.notification_delivery_log(next_attempt_at, id)
  where status in ('queued', 'failed');

create or replace function public.enqueue_operational_announcement(
  p_title text, p_message text, p_audience text, p_sender_profile_id uuid,
  p_event_key text, p_source_type text, p_source_id text, p_recipient_profile_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  announcement_id uuid;
  was_created boolean := false;
  recipient_count integer;
begin
  if coalesce(array_length(p_recipient_profile_ids, 1), 0) = 0 then raise exception 'No recipients supplied'; end if;
  insert into public.announcements(title, message, audience, sender_profile_id, event_key, source_type, source_id)
  values (btrim(p_title), btrim(p_message), p_audience, p_sender_profile_id, nullif(btrim(p_event_key), ''), nullif(btrim(p_source_type), ''), nullif(btrim(p_source_id), ''))
  on conflict (sender_profile_id, event_key) where event_key is not null do nothing
  returning id into announcement_id;
  if announcement_id is not null then was_created := true;
  else
    select id into announcement_id from public.announcements
      where sender_profile_id = p_sender_profile_id and event_key = p_event_key;
  end if;
  if announcement_id is null then raise exception 'Announcement could not be created'; end if;

  insert into public.notification_delivery_log(announcement_id, staff_profile_id, channel, status, attempts, next_attempt_at)
  select announcement_id, profile.id, 'in_app', 'queued', 1, now()
  from public.staff_profiles profile
  where profile.id = any(p_recipient_profile_ids) and profile.directory_active is true
  on conflict (announcement_id, staff_profile_id, channel) do nothing;
  get diagnostics recipient_count = row_count;
  if recipient_count = 0 and was_created then raise exception 'No active recipients were queued'; end if;
  return jsonb_build_object('id', announcement_id, 'created', was_created, 'recipientCount', recipient_count);
end;
$$;
revoke all on function public.enqueue_operational_announcement(text, text, text, uuid, text, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.enqueue_operational_announcement(text, text, text, uuid, text, text, text, uuid[]) to service_role;

commit;
