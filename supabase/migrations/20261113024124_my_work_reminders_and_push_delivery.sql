begin;

create table public.notification_scheduler_settings (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  activated_at timestamptz
);
insert into public.notification_scheduler_settings(id) values(true);
alter table public.notification_scheduler_settings enable row level security;
revoke all on public.notification_scheduler_settings from public, anon, authenticated;
grant select, update on public.notification_scheduler_settings to service_role;

create table public.my_work_reminder_events (
  task_id uuid not null references public.my_work_tasks(id) on delete restrict,
  reminder_at timestamptz not null,
  announcement_id uuid not null references public.announcements(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(task_id, reminder_at)
);
alter table public.my_work_reminder_events enable row level security;
revoke all on public.my_work_reminder_events from public, anon, authenticated;
grant select, insert on public.my_work_reminder_events to service_role;
create index my_work_tasks_pending_reminder_idx on public.my_work_tasks(reminder_at, id)
  where reminder_at is not null and is_completed = false;
alter table public.web_push_subscriptions add column last_test_at timestamptz;

create function public.enqueue_due_my_work_reminders() returns integer
language plpgsql security invoker set search_path = '' as $$
declare task public.my_work_tasks; targets uuid[]; queued jsonb; cutoff timestamptz; processed integer := 0;
begin
  select activated_at into cutoff from public.notification_scheduler_settings where id and enabled;
  if cutoff is null then return 0; end if;
  for task in select t.* from public.my_work_tasks t
    where not t.is_completed and t.reminder_at >= cutoff and t.reminder_at >= now() - interval '24 hours' and t.reminder_at <= now()
      and not exists(select 1 from public.my_work_reminder_events e where e.task_id=t.id and e.reminder_at=t.reminder_at)
    order by t.reminder_at,t.id limit 100 for update of t skip locked loop
    select array_agg(distinct s.id) into targets from public.staff_profiles s
      where s.directory_active and s.auth_user_id is not null
      and (s.id=task.created_by_profile_id or exists(select 1 from public.my_work_task_assignees a where a.task_id=task.id and a.staff_profile_id=s.id))
      and (s.role in ('supervisor','partner','admin') or (
        coalesce((select policy->(case when s.role='leader' then 'leader' else 'associate' end)->'myWork'->>'mode' from public.feature_access_settings where id),'enabled') in ('enabled','preview')
        and coalesce((select policy->(case when s.role='leader' then 'leader' else 'associate' end)->'notifications'->>'mode' from public.feature_access_settings where id),'enabled') in ('enabled','preview')));
    if coalesce(cardinality(targets),0)=0 then continue; end if;
    queued := public.enqueue_operational_announcement('My Work reminder',
      task.title || E'\nScheduled: ' || to_char(task.reminder_at at time zone 'Asia/Makassar','DD/MM/YYYY HH24:MI') || ' WITA',
      'all',task.created_by_profile_id,'my-work-reminder:'||task.id::text||':'||extract(epoch from task.reminder_at)::text,
      'my_work_reminder',task.id::text,targets);
    insert into public.my_work_reminder_events(task_id,reminder_at,announcement_id)
      values(task.id,task.reminder_at,(queued->>'id')::uuid);
    insert into public.announcement_recipients(announcement_id,staff_profile_id)
      select (queued->>'id')::uuid,unnest(targets) on conflict(announcement_id,staff_profile_id) do nothing;
    update public.notification_delivery_log set status='delivered',delivered_at=now(),completed_at=now(),last_error=null
      where announcement_id=(queued->>'id')::uuid and staff_profile_id=any(targets) and channel='in_app';
    insert into public.notification_delivery_log(announcement_id,staff_profile_id,channel,status,attempts,next_attempt_at)
      select (queued->>'id')::uuid,s.staff_profile_id,'web_push','queued',1,now()
      from public.web_push_subscriptions s where s.staff_profile_id=any(targets) group by s.staff_profile_id
      on conflict(announcement_id,staff_profile_id,channel) do nothing;
    processed := processed+1;
  end loop;
  return processed;
end;
$$;

create function public.claim_notification_deliveries(p_limit integer default 10)
returns setof public.notification_delivery_log language plpgsql security invoker set search_path = '' as $$
begin
  update public.notification_delivery_log set status='failed',completed_at=now(),last_error=coalesce(last_error,'Delivery retry limit reached.')
    where completed_at is null and attempts>=max_attempts and next_attempt_at<=now();
  -- Rescheduled/completed reminders are not delivered late by retry workers.
  update public.notification_delivery_log j set status='failed',completed_at=now(),last_error='Reminder cancelled or rescheduled.'
    where j.completed_at is null and exists(select 1 from public.my_work_reminder_events e
      join public.my_work_tasks t on t.id=e.task_id where e.announcement_id=j.announcement_id
      and (t.is_completed or t.reminder_at is distinct from e.reminder_at));
  return query with candidates as (
    select j.id from public.notification_delivery_log j where j.status in ('queued','failed') and j.completed_at is null
      and j.next_attempt_at<=now() order by j.next_attempt_at,j.id limit greatest(1,least(p_limit,30)) for update skip locked
  ) update public.notification_delivery_log j set next_attempt_at=now()+interval '5 minutes',attempts=j.attempts+1
    from candidates c where j.id=c.id returning j.*;
end;
$$;

create function public.claim_push_subscription_test(p_id uuid,p_profile_id uuid) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  update public.web_push_subscriptions set last_test_at=now() where id=p_id and staff_profile_id=p_profile_id
    and (last_test_at is null or last_test_at < now()-interval '30 seconds');
  return found;
end;
$$;

-- Only this narrow helper reads the scheduler token; it never returns its value.
create function public.authorize_notification_scheduler(p_token text) returns boolean
language sql security definer set search_path = '' as $$
  select length(p_token)=64 and exists(select 1 from vault.decrypted_secrets
    where name='tax_dashboard_notification_scheduler' and decrypted_secret=p_token);
$$;

revoke all on function public.enqueue_due_my_work_reminders() from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
revoke all on function public.claim_push_subscription_test(uuid,uuid) from public, anon, authenticated;
revoke all on function public.authorize_notification_scheduler(text) from public, anon, authenticated;
grant execute on function public.enqueue_due_my_work_reminders(), public.claim_notification_deliveries(integer),
  public.claim_push_subscription_test(uuid,uuid), public.authorize_notification_scheduler(text) to service_role;

commit;
