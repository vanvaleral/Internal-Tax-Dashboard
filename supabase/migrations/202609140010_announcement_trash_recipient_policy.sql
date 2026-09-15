-- A recipient may only hide announcements that belong to their own inbox.
-- This lets the API write the recovery record directly without a separate
-- recipient lookup on every delete request.
drop policy if exists announcement_recipient_trash_self on public.announcement_recipient_trash;
create policy announcement_recipient_trash_recipient_only on public.announcement_recipient_trash
  for all to authenticated
  using (
    staff_profile_id in (select id from public.staff_profiles where auth_user_id = auth.uid())
    and exists (
      select 1 from public.announcement_recipients recipient
      where recipient.announcement_id = announcement_recipient_trash.announcement_id
        and recipient.staff_profile_id = announcement_recipient_trash.staff_profile_id
    )
  )
  with check (
    staff_profile_id in (select id from public.staff_profiles where auth_user_id = auth.uid())
    and exists (
      select 1 from public.announcement_recipients recipient
      where recipient.announcement_id = announcement_recipient_trash.announcement_id
        and recipient.staff_profile_id = announcement_recipient_trash.staff_profile_id
    )
  );
