-- Run only after the additive migration. Every synthetic task/event is rolled back.
begin;
set local lock_timeout = '5s';
set local role service_role;
do $$
declare
  actor uuid;
  case1 uuid;
  case2 uuid;
  task uuid := gen_random_uuid();
  token uuid := gen_random_uuid();
  v_steps jsonb := '[{"id":"step-A","title":"Worksheet","done":false},{"id":"step-B","title":"Meeting","done":false}]';
begin
  select id into actor from public.staff_profiles where directory_active and auth_user_id is not null
    and role in ('supervisor','partner','admin') limit 1;
  select id into case1 from public.tax_cases where deleted_at is null limit 1;
  select id into case2 from public.tax_cases where deleted_at is null and id <> case1 limit 1;
  if actor is null or case1 is null or case2 is null then raise exception 'Active leadership and two Cases are required for this rolled-back check.'; end if;
  insert into public.my_work_tasks(id,title,created_by_profile_id,case_id,steps,step_change_actor_profile_id,step_change_id)
    values(task,'Synthetic subtask transaction test',actor,case1,v_steps,actor,token);
  assert not exists (select 1 from public.tax_case_task_timeline where task_id = task), 'unchecked steps are not progress';
  v_steps := jsonb_set(jsonb_set(v_steps,'{0,done}','true'),'{1,done}','true');
  update public.my_work_tasks set steps = v_steps,step_change_actor_profile_id = actor,step_change_id = gen_random_uuid() where id = task;
  assert (select count(*) = 2 from public.tax_case_task_timeline where task_id = task and event_type = 'step_completed'), 'one entry per checked step, even in the same save';
  assert (select count(distinct occurred_at) = 1 and bool_and(actor_profile_id = actor) from public.tax_case_task_timeline where task_id = task), 'steps have their verified actor and one atomic event time';
  assert (select not is_completed from public.my_work_tasks where id = task), 'checking steps must not complete the parent';
  update public.my_work_tasks set steps = v_steps,notes = 'Repeated save',step_change_id = gen_random_uuid() where id = task;
  v_steps := jsonb_set(v_steps,'{0,title}','"Renamed worksheet"');
  update public.my_work_tasks set steps = jsonb_build_array(v_steps->1,v_steps->0),title = 'Renamed parent',step_change_id = gen_random_uuid() where id = task;
  assert (select count(*) = 2 from public.tax_case_task_timeline where task_id = task), 'notes, renames, reordering and repeats cannot duplicate events';
  assert exists (select 1 from public.tax_case_task_timeline where task_id = task and step_title = 'Worksheet' and title = 'Synthetic subtask transaction test'), 'snapshot labels remain immutable';

  v_steps := jsonb_set(v_steps,'{0,done}','false');
  update public.my_work_tasks set steps = v_steps,step_change_id = gen_random_uuid() where id = task;
  assert (select count(*) = 1 from public.tax_case_task_timeline where task_id = task and event_type = 'step_reopened'), 'unchecking is retained as a separate event';
  v_steps := jsonb_set(v_steps,'{0,done}','true');
  update public.my_work_tasks set steps = v_steps,step_change_id = gen_random_uuid() where id = task;
  assert (select count(*) = 3 from public.tax_case_task_timeline where task_id = task and event_type = 'step_completed'), 'recompletion is a new event, not a rewritten prior entry';
  update public.my_work_tasks set is_completed = true,completed_at = clock_timestamp(),completed_by_profile_id = actor where id = task;
  assert (select count(*) = 1 from public.tax_case_task_timeline where task_id = task and event_type = 'completed'), 'parent completion remains supported';
  assert (select count(*) = 3 from public.tax_case_task_timeline where task_id = task and event_type = 'step_completed'), 'parent completion cannot duplicate step events';

  update public.my_work_tasks set case_id = case2 where id = task;
  assert (select count(*) = 2 from public.tax_case_task_timeline where task_id = task and case_id = case2 and event_type = 'step_snapshot' and occurred_at is null and actor_profile_id is null), 'relinked checked steps cannot claim new work or a guessed completer';
  update public.my_work_tasks set case_id = case1 where id = task;
  assert not exists (select 1 from public.tax_case_task_timeline where task_id = task and case_id = case1 and event_type = 'step_snapshot'), 'known original-case completions must not be snapshotted twice';

  -- Simulate an old writer that does not provide a fresh actor token.
  v_steps := jsonb_set(v_steps,'{1,done}','false');
  update public.my_work_tasks set steps = v_steps where id = task;
  assert exists (select 1 from public.tax_case_task_timeline where task_id = task and step_id = 'step-B' and event_type = 'step_reopened' and actor_profile_id is null and actor_name = 'Unknown PIC'), 'never reuse the previous writer for an unverified old save';
  update public.my_work_tasks set steps = jsonb_build_array(v_steps->1) where id = task;
  assert (select count(*) = 3 from public.tax_case_task_timeline where task_id = task and event_type = 'step_completed'), 'removing a step cannot remove work history';
  assert not has_table_privilege('authenticated','public.tax_case_task_timeline','INSERT'), 'direct staff timeline inserts remain blocked';
  assert not has_table_privilege('service_role','public.tax_case_task_timeline','UPDATE'), 'the server cannot rewrite history';
  assert not has_function_privilege('anon','public.capture_case_subtask_timeline()','EXECUTE'), 'trigger is not a public RPC';
end;
$$;
rollback;
select 'Subtask timeline transaction checks passed; all synthetic records rolled back.' as result;
