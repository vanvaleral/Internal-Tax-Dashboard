begin;

do $$ begin
  if to_regclass('cron.job') is null then create extension if not exists pg_cron; end if;
  if to_regnamespace('net') is null then create extension if not exists pg_net with schema extensions; end if;
  if not exists(select 1 from vault.secrets where name='tax_dashboard_notification_scheduler') then
    perform vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'tax_dashboard_notification_scheduler');
  end if;
end $$;

create function public.notification_scheduler_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare queued integer; request_id bigint;
begin
  if not exists(select 1 from public.notification_scheduler_settings where id and enabled) then
    return jsonb_build_object('enabled',false);
  end if;
  queued := public.enqueue_due_my_work_reminders();
  if exists(select 1 from public.notification_delivery_log where status in ('queued','failed') and completed_at is null and next_attempt_at<=now()) then
    select net.http_get(
      url:='https://internal-tax-dashboard.vercel.app/api/maintenance/deliver-notifications',
      headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='tax_dashboard_notification_scheduler')),
      timeout_milliseconds:=60000) into request_id;
  end if;
  return jsonb_build_object('enabled',true,'reminders_queued',queued,'worker_requested',request_id is not null);
end;
$$;

create function public.set_notification_scheduler_enabled(p_enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare job bigint;
begin
  select jobid into job from cron.job where jobname='lmats-notification-minute';
  if job is null then raise exception 'Notification schedule is not installed'; end if;
  update public.notification_scheduler_settings set enabled=p_enabled,
    activated_at=case when p_enabled then coalesce(activated_at,clock_timestamp()) else activated_at end where id;
  perform cron.alter_job(job,active:=p_enabled);
  return p_enabled;
end;
$$;

revoke all on function public.notification_scheduler_tick() from public, anon, authenticated;
revoke all on function public.set_notification_scheduler_enabled(boolean) from public, anon, authenticated;
grant execute on function public.notification_scheduler_tick(), public.set_notification_scheduler_enabled(boolean) to service_role;

-- Prepare only. Activate after the matching website worker is deployed and authenticated.
do $$ declare job bigint; begin
  if not exists(select 1 from cron.job where jobname='lmats-notification-minute') then
    job:=cron.schedule('lmats-notification-minute','* * * * *','select public.notification_scheduler_tick();');
    perform cron.alter_job(job,active:=false);
  end if;
end $$;

commit;
