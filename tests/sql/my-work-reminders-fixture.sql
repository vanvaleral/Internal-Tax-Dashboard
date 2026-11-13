-- Fresh disposable LOCAL database only. Synthetic records and scheduler stubs.
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema vault;
create table vault.secrets(id uuid default gen_random_uuid(),name text unique,secret text);
create view vault.decrypted_secrets as select name,secret as decrypted_secret from vault.secrets;
create function vault.create_secret(secret text,name text) returns uuid language sql as $$ insert into vault.secrets(secret,name) values($1,$2) returning id $$;
create schema cron;
create table cron.job(jobid bigint generated always as identity,jobname text unique,schedule text,command text,active boolean default true);
create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid $$;
create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$ update cron.job set active=$2 where jobid=$1 $$;
create schema net;
create table net.fixture_requests(id bigint generated always as identity,url text,headers jsonb);
create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language sql as $$ insert into net.fixture_requests(url,headers) values($1,$2) returning id $$;
create table public.staff_profiles(id uuid primary key,role text,directory_active boolean,auth_user_id uuid default gen_random_uuid());
create table public.feature_access_settings(id boolean primary key,policy jsonb);
insert into public.feature_access_settings values(true,'{"associate":{"myWork":{"mode":"enabled"},"notifications":{"mode":"enabled"}},"leader":{"myWork":{"mode":"enabled"},"notifications":{"mode":"enabled"}}}');
create table public.my_work_tasks(id uuid primary key,title text,created_by_profile_id uuid references public.staff_profiles,
  reminder_at timestamptz,is_completed boolean default false,updated_at timestamptz default now());
create table public.my_work_task_assignees(task_id uuid references public.my_work_tasks,staff_profile_id uuid references public.staff_profiles);
create table public.announcements(id uuid primary key default gen_random_uuid(),title text,message text,audience text,sender_profile_id uuid references public.staff_profiles,
  event_key text,source_type text,source_id text);
create unique index announcements_sender_event_key_unique on public.announcements(sender_profile_id,event_key) where event_key is not null;
create table public.announcement_recipients(announcement_id uuid references public.announcements,staff_profile_id uuid references public.staff_profiles,primary key(announcement_id,staff_profile_id));
create table public.notification_delivery_log(id bigint generated always as identity primary key,announcement_id uuid references public.announcements,
  staff_profile_id uuid references public.staff_profiles,channel text,status text,attempts integer default 1,max_attempts integer default 8,
  next_attempt_at timestamptz default now(),completed_at timestamptz,delivered_at timestamptz,last_error text,
  unique(announcement_id,staff_profile_id,channel));
create table public.web_push_subscriptions(id uuid primary key default gen_random_uuid(),staff_profile_id uuid references public.staff_profiles,endpoint text);
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
\ir ../../supabase/migrations/20261102094113_fix_announcement_outbox_variable_ambiguity.sql
\ir ../../supabase/migrations/20261113024124_my_work_reminders_and_push_delivery.sql
\ir ../../supabase/migrations/20261113024528_notification_minute_scheduler.sql

insert into public.staff_profiles(id,role,directory_active) values
 ('00000000-0000-4000-8000-000000000001','supervisor',true),
 ('00000000-0000-4000-8000-000000000002','staff',true),
 ('00000000-0000-4000-8000-000000000003','staff',true),
 ('00000000-0000-4000-8000-000000000004','staff',false);
insert into public.my_work_tasks(id,title,created_by_profile_id,reminder_at,is_completed) values
 ('00000000-0000-4000-8000-000000000011','Due synthetic task','00000000-0000-4000-8000-000000000001',now()-interval '1 minute',false),
 ('00000000-0000-4000-8000-000000000012','Future task','00000000-0000-4000-8000-000000000001',now()+interval '1 day',false),
 ('00000000-0000-4000-8000-000000000013','Completed task','00000000-0000-4000-8000-000000000001',now()-interval '1 minute',true),
 ('00000000-0000-4000-8000-000000000014','Old overdue task','00000000-0000-4000-8000-000000000001',now()-interval '5 days',false),
 ('00000000-0000-4000-8000-000000000015','Inactive owner task','00000000-0000-4000-8000-000000000004',now()-interval '1 minute',false);
insert into public.my_work_task_assignees values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002');
insert into public.web_push_subscriptions(staff_profile_id,endpoint) values
 ('00000000-0000-4000-8000-000000000001','https://push.invalid/one'),('00000000-0000-4000-8000-000000000001','https://push.invalid/two');
create temporary table tasks_before as select * from public.my_work_tasks;
grant select on tasks_before to service_role;
set role service_role;
do $$ declare pushed integer; device uuid; event uuid; begin
  assert public.enqueue_due_my_work_reminders()=0, 'paused by default';
  assert not (select enabled from public.notification_scheduler_settings);
  assert public.set_notification_scheduler_enabled(true), 'activation available only through service helper';
  assert public.enqueue_due_my_work_reminders()=0, 'old reminders before activation are skipped';
  update public.notification_scheduler_settings set activated_at=now()-interval '1 hour';
  assert public.enqueue_due_my_work_reminders()=1, 'only due, unfinished, accessible task';
  assert public.enqueue_due_my_work_reminders()=0, 'repeat tick never duplicates';
  assert (select count(*)=1 from public.my_work_reminder_events);
  assert (select count(*)=2 from public.announcement_recipients), 'only creator and assignee';
  assert (select count(*)=2 from public.notification_delivery_log where channel='in_app' and status='delivered');
  assert (select count(*)=1 from public.notification_delivery_log where channel='web_push' and status='queued'), 'one job per profile, not device';
  assert not exists(select 1 from tasks_before b full join public.my_work_tasks t using(id) where to_jsonb(b) is distinct from to_jsonb(t)), 'reminder delivery does not mutate tasks';
  assert (select count(*)=1 from public.claim_notification_deliveries(10));
  assert (select count(*)=0 from public.claim_notification_deliveries(10)), 'leased jobs not claimed twice';
  update public.my_work_tasks set is_completed=true where id='00000000-0000-4000-8000-000000000011';
  perform public.claim_notification_deliveries(10);
  assert (select completed_at is not null and last_error='Reminder cancelled or rescheduled.' from public.notification_delivery_log where channel='web_push'), 'cancel queued push after completion';
  update public.my_work_tasks set is_completed=false,reminder_at=now() where id='00000000-0000-4000-8000-000000000011';
  assert public.enqueue_due_my_work_reminders()=1, 'new reminder time gets a new event';
  assert (select count(*)=2 from public.my_work_reminder_events);
  select id into device from public.web_push_subscriptions limit 1;
  assert not public.claim_push_subscription_test(device,'00000000-0000-4000-8000-000000000003'), 'cannot test another account';
  assert public.claim_push_subscription_test(device,'00000000-0000-4000-8000-000000000001');
  assert not public.claim_push_subscription_test(device,'00000000-0000-4000-8000-000000000001'), 'test rate limit';
  assert not public.authorize_notification_scheduler('wrong');
end $$;
reset role;
do $$ begin
  assert (select active from cron.job where jobname='lmats-notification-minute');
  assert (select public.authorize_notification_scheduler(decrypted_secret) from vault.decrypted_secrets where name='tax_dashboard_notification_scheduler');
  perform public.notification_scheduler_tick();
  assert (select count(*)=1 from net.fixture_requests), 'HTTP requested only when jobs are due';
  perform public.set_notification_scheduler_enabled(false);
  assert not (select active from cron.job where jobname='lmats-notification-minute');
  assert not has_function_privilege('anon','public.enqueue_due_my_work_reminders()','EXECUTE');
  assert not has_function_privilege('authenticated','public.set_notification_scheduler_enabled(boolean)','EXECUTE');
  assert not has_function_privilege('authenticated','public.authorize_notification_scheduler(text)','EXECUTE');
end $$;
select 'reminder SQL fixture passed' as result;
