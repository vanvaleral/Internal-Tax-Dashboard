export type ReportProgress = { entry: string; creatorName: string; createdAt: string | null; source: string };
const person = (value: any) => Array.isArray(value) ? value[0] : value;

export function latestCaseReportProgress(cases: any[], snapshots: any[], entries: any[], completedTasks: any[]) {
  const result: Record<string, ReportProgress | null> = Object.fromEntries(cases.map(row=>[row.id,null]));
  const snapshotsByTask = new Set(snapshots.map(row=>`${row.case_id}:${row.task_id}`));
  function add(caseId: string, entry: unknown, creatorName: unknown, at: unknown, source: string) {
    if (!Object.hasOwn(result,caseId) || typeof entry !== "string" || !entry.trim()) return;
    const date = typeof at === "string" && Number.isFinite(Date.parse(at)) ? at : null;
    const event = {entry,creatorName:typeof creatorName === "string" && creatorName.trim()?creatorName:"Unknown PIC",createdAt:date,source};
    const existing = result[caseId];
    if (!existing || (date?Date.parse(date):-1)>(existing.createdAt?Date.parse(existing.createdAt):-1)) result[caseId]=event;
  }
  // Equal timestamps use the same source priority as the expanded case timeline.
  for (const row of entries) {
    const author=person(row.staff_profiles);
    add(row.case_id,row.entry,author?.display_name||author?.full_name,row.created_at,"Follow-up");
  }
  for (const row of snapshots) {
    const prefix=row.event_type==="reopened"?"Reopened: ":row.event_type==="unlinked"?"Link removed: ":row.event_type==="linked_completed"?"Linked completed task: ":"Completed: ";
    add(row.case_id,prefix+row.title,row.actor_name,row.occurred_at,"My Work");
  }
  for (const row of completedTasks) if (!snapshotsByTask.has(`${row.case_id}:${row.id}`)) {
    const author=person(row.completer);
    add(row.case_id,row.title,author?.display_name||author?.full_name||"Unknown completer",row.completed_at,"My Work");
  }
  for (const row of cases) for (const event of row.case_workflow?.events||[]) add(row.id,event.text,event.actor,event.at,"Case action");
  return result;
}

export function lastCaseReportUpdates(cases: any[], latest: Record<string,ReportProgress|null>) {
  return Object.fromEntries(cases.map(row=>{
    const progress=latest[row.id], updater=person(row.updater);
    const recordAt=typeof row.updated_at === "string" && Number.isFinite(Date.parse(row.updated_at))?row.updated_at:null;
    const record={createdAt:recordAt,creatorName:updater?.display_name||updater?.full_name||"Unknown PIC",source:"Case record"};
    return [row.id,progress?.createdAt && (!recordAt||Date.parse(progress.createdAt)>Date.parse(recordAt))?{createdAt:progress.createdAt,creatorName:progress.creatorName,source:progress.source}:record];
  }));
}

export async function readReportHistory(admin: any, table: string, fields: string, caseIds: string[], timestamp: string, completed = false) {
  const rows: any[]=[];
  for (let offset=0;offset<=10000;offset+=1000) {
    let query=admin.from(table).select(fields).in("case_id",caseIds).order(timestamp,{ascending:false}).order("id",{ascending:false}).range(offset,offset+999);
    if (completed) query=query.eq("is_completed",true);
    const {data,error}=await query;
    if (error) {
      if (table==="tax_case_task_timeline" && ["42P01","PGRST205"].includes(error.code)) return [];
      throw new Error(error.message || "Latest case progress could not be loaded.");
    }
    rows.push(...(data||[]));
    if (rows.length>10000) throw new Error("This report has too much progress history. Narrow the case filters and retry.");
    if (!data || data.length<1000) return rows;
  }
  throw new Error("Narrow the case filters before printing this report.");
}
