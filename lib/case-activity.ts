const sources = [
  ["latest_followup", "tax_case_progress_entries", "created_at"],
  ["latest_task", "tax_case_task_timeline", "occurred_at"],
  ["latest_completion", "my_work_tasks", "completed_at"],
  ["my_followup", "tax_case_progress_entries", "created_at"],
  ["my_task", "tax_case_task_timeline", "occurred_at"],
  ["my_completion", "my_work_tasks", "completed_at"]
] as const;

export const caseActivitySelect = "*," + sources.map(([alias,table,field]) => `${alias}:${table}(${field})`).join(",");
export function caseActivityQuery(query: any, profileId: string) {
  for (const [alias,,field] of sources) query = query.order(field,{referencedTable:alias,ascending:false,nullsFirst:false}).limit(1,{referencedTable:alias});
  return query.eq("latest_completion.is_completed",true).eq("my_completion.is_completed",true)
    .eq("my_completion.completed_by_profile_id",profileId).eq("my_followup.created_by_profile_id",profileId).eq("my_task.actor_profile_id",profileId);
}
function newest(values: unknown[]) {
  return values.filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((a,b) => Date.parse(b)-Date.parse(a))[0] || null;
}
export function withCaseActivity(row: any, profileId: string, userId: string) {
  const base = {...row};
  const all: unknown[] = [row.created_at,row.updated_at], mine: unknown[] = [];
  if (row.updated_by_profile_id === profileId) mine.push(row.updated_at);
  if (row.created_by === userId) mine.push(row.created_at);
  for (const [alias,,field] of sources) {
    for (const entry of row[alias] || []) (alias.startsWith("my_") ? mine : all).push(entry[field]);
    delete base[alias];
  }
  for (const event of row.case_workflow?.events || []) {
    all.push(event.at); if (event.actorId === profileId) mine.push(event.at);
  }
  return {...base,last_activity_at:newest([...all,...mine]),my_last_activity_at:newest(mine),activity_available:true};
}
