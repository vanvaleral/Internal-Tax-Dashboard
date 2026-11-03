begin;

-- Applied version matches the production migration ledger (2026-11-02).
-- Keep the existing signature/ACL; avoid local names that collide with columns.
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
  v_announcement_id uuid;
  v_was_created boolean := false;
  v_recipient_count integer;
begin
  if coalesce(array_length(p_recipient_profile_ids, 1), 0) = 0 then
    raise exception 'No recipients supplied';
  end if;

  insert into public.announcements(title, message, audience, sender_profile_id, event_key, source_type, source_id)
  values (btrim(p_title), btrim(p_message), p_audience, p_sender_profile_id,
    nullif(btrim(p_event_key), ''), nullif(btrim(p_source_type), ''), nullif(btrim(p_source_id), ''))
  on conflict (sender_profile_id, event_key) where event_key is not null do nothing
  returning id into v_announcement_id;

  if v_announcement_id is not null then
    v_was_created := true;
  else
    select a.id into v_announcement_id
    from public.announcements a
    where a.sender_profile_id = p_sender_profile_id and a.event_key = p_event_key;
  end if;
  if v_announcement_id is null then raise exception 'Announcement could not be created'; end if;

  insert into public.notification_delivery_log(announcement_id, staff_profile_id, channel, status, attempts, next_attempt_at)
  select v_announcement_id, profile.id, 'in_app', 'queued', 1, now()
  from public.staff_profiles profile
  where profile.id = any(p_recipient_profile_ids) and profile.directory_active is true
  on conflict (announcement_id, staff_profile_id, channel) do nothing;
  get diagnostics v_recipient_count = row_count;
  if v_recipient_count = 0 and v_was_created then raise exception 'No active recipients were queued'; end if;

  return jsonb_build_object('id', v_announcement_id, 'created', v_was_created, 'recipientCount', v_recipient_count);
end;
$$;

revoke all on function public.enqueue_operational_announcement(text, text, text, uuid, text, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.enqueue_operational_announcement(text, text, text, uuid, text, text, text, uuid[]) to service_role;

commit;
