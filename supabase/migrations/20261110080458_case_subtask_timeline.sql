-- Add immutable subtask progress without changing task contents or awarding points.
begin;
set local lock_timeout = '5s';
alter table public.my_work_tasks
  add column step_change_actor_profile_id uuid references public.staff_profiles(id) on delete set null,
  add column step_change_id uuid;
alter table public.tax_case_task_timeline
  add column step_id text,
  add column step_title text,
  alter column occurred_at drop not null,
  drop constraint tax_case_task_timeline_event_type_check,
  drop constraint tax_case_task_timeline_case_id_task_id_event_type_occurred__key;
alter table public.tax_case_task_timeline
  add constraint tax_case_task_timeline_event_type_check check (event_type in
    ('completed','reopened','unlinked','linked_completed','step_completed','step_reopened','step_snapshot')),
  add constraint tax_case_task_timeline_step_shape_check check (
    (event_type in ('step_completed','step_reopened','step_snapshot')) = (step_id is not null and step_title is not null)
    and (event_type = 'step_snapshot') = (occurred_at is null));
create unique index tax_case_task_timeline_event_identity_idx on public.tax_case_task_timeline
  (case_id,task_id,event_type,occurred_at,coalesce(step_id,'')) where occurred_at is not null;
create unique index tax_case_task_timeline_step_snapshot_idx on public.tax_case_task_timeline
  (case_id,task_id,step_id) where event_type = 'step_snapshot';

create function public.capture_case_subtask_timeline() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_step jsonb;
  v_old_step jsonb;
  v_old_steps jsonb := '[]'::jsonb;
  v_old_by_id jsonb := '{}'::jsonb;
  v_step_id text;
  v_index bigint;
  v_actor uuid;
  v_actor_name text;
  v_kind text;
  v_link_changed boolean := false;
  v_event_time timestamptz := clock_timestamp();
begin
  if new.case_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    v_link_changed := old.case_id is distinct from new.case_id;
    if not v_link_changed and old.steps is not distinct from new.steps then return new; end if;
    v_old_steps := case when jsonb_typeof(old.steps) = 'array' then old.steps else '[]'::jsonb end;
    select coalesce(jsonb_object_agg(coalesce(nullif(value->>'id',''),
      'legacy:' || new.id::text || ':' || (ordinality - 1)::text),value),'{}'::jsonb)
      into v_old_by_id from jsonb_array_elements(v_old_steps) with ordinality;
    if new.step_change_id is distinct from old.step_change_id then v_actor := new.step_change_actor_profile_id; end if;
  else
    if new.step_change_id is not null then v_actor := new.step_change_actor_profile_id; end if;
  end if;
  select coalesce(s.display_name,s.full_name,'Unknown PIC') into v_actor_name from public.staff_profiles s
    where s.id = v_actor and s.directory_active;
  if not found then v_actor := null; v_actor_name := 'Unknown PIC'; end if;
  for v_step,v_index in select value,ordinality - 1 from jsonb_array_elements(
    case when jsonb_typeof(new.steps) = 'array' then new.steps else '[]'::jsonb end) with ordinality loop
    if coalesce(btrim(v_step->>'title'),'') = '' then continue; end if;
    v_step_id := coalesce(nullif(v_step->>'id',''),'legacy:' || new.id::text || ':' || v_index::text);
    v_old_step := v_old_by_id->v_step_id;
    v_kind := null;
    if coalesce(v_step->>'done','false') = 'true' then
      if v_link_changed and coalesce(v_old_step->>'done','false') = 'true' then v_kind := 'step_snapshot';
      elsif coalesce(v_old_step->>'done','false') <> 'true' then v_kind := 'step_completed'; end if;
    elsif not v_link_changed and coalesce(v_old_step->>'done','false') = 'true' then v_kind := 'step_reopened';
    end if;
    if v_kind is not null then
      if v_kind = 'step_snapshot' and exists (select 1 from public.tax_case_task_timeline e
        where e.case_id = new.case_id and e.task_id = new.id and e.step_id = v_step_id
          and e.event_type in ('step_completed','step_snapshot')) then continue; end if;
      insert into public.tax_case_task_timeline(case_id,task_id,title,step_id,step_title,actor_profile_id,actor_name,event_type,occurred_at)
      values(new.case_id,new.id,new.title,v_step_id,v_step->>'title',
        case when v_kind = 'step_snapshot' then null else v_actor end,
        case when v_kind = 'step_snapshot' then 'Completion PIC not recorded' else v_actor_name end,
        v_kind,case when v_kind = 'step_snapshot' then null else v_event_time end) on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.capture_case_subtask_timeline() from public, anon, authenticated;
create trigger capture_case_subtask_timeline after insert or update of steps,case_id on public.my_work_tasks
for each row execute function public.capture_case_subtask_timeline();

-- Existing checkmarks establish visible history, not a fabricated completion date or completer.
insert into public.tax_case_task_timeline(case_id,task_id,title,step_id,step_title,actor_name,event_type,occurred_at)
select t.case_id,t.id,t.title,
  coalesce(nullif(s.value->>'id',''),'legacy:' || t.id::text || ':' || (s.ordinality - 1)::text),
  s.value->>'title','Completion PIC not recorded','step_snapshot',null
from public.my_work_tasks t cross join lateral jsonb_array_elements(
  case when jsonb_typeof(t.steps) = 'array' then t.steps else '[]'::jsonb end) with ordinality s
where t.case_id is not null and s.value->>'done' = 'true' and coalesce(btrim(s.value->>'title'),'') <> ''
on conflict do nothing;
commit;
