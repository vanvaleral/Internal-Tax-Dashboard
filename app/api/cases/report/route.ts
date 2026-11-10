import { NextRequest, NextResponse } from "next/server";
import { isLeadership } from "@/lib/access";
import { currentCaseActor } from "@/lib/case-access";
import { latestCaseReportProgress, lastCaseReportUpdates, readReportHistory } from "@/lib/case-report-progress";

export async function POST(request: NextRequest) {
  const started=Date.now();
  const actor=await currentCaseActor(request);
  if ("error" in actor) return NextResponse.json({error:actor.error},{status:actor.status});
  const authenticated=Date.now();
  try {
    const body=await request.json();
    if (!body || !Array.isArray(body.caseIds) || !body.caseIds.length || body.caseIds.length>100 || body.caseIds.some((id: unknown)=>typeof id!=="string"||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))) return NextResponse.json({error:"Choose 1 to 100 valid case IDs per request."},{status:400});
    const ids=[...new Set<string>(body.caseIds.map((id: string)=>id.toLowerCase()))];
    const {data:cases,error}=await actor.admin.from("tax_cases").select("id, updated_at, tax_pic_profile_id, accounting_pic_profile_id, case_workflow, updater:staff_profiles!tax_cases_updated_by_profile_id_fkey(display_name, full_name)").in("id",ids).is("deleted_at",null);
    if (error) throw new Error(error.message);
    if (cases?.length!==ids.length || cases.some((row: any)=>!isLeadership(actor.profile.role)&&![row.tax_pic_profile_id,row.accounting_pic_profile_id].includes(actor.profile.id))) return NextResponse.json({error:"One or more cases are no longer available in your access scope. Refresh the case list."},{status:403});
    const [snapshots,entries,tasks]=await Promise.all([
      readReportHistory(actor.admin,"tax_case_task_timeline","id, case_id, task_id, title, step_id, step_title, actor_name, event_type, occurred_at",ids,"occurred_at"),
      readReportHistory(actor.admin,"tax_case_progress_entries","id, case_id, entry, created_at, staff_profiles!tax_case_progress_entries_created_by_profile_id_fkey(display_name, full_name)",ids,"created_at"),
      readReportHistory(actor.admin,"my_work_tasks","id, case_id, title, completed_at, completer:staff_profiles!my_work_tasks_completed_by_profile_id_fkey(display_name, full_name)",ids,"completed_at",true)
    ]);
    const {data:versions,error:versionError}=await actor.admin.from("tax_cases").select("id, updated_at").in("id",ids).is("deleted_at",null);
    if (versionError) throw new Error(versionError.message);
    const versionRows=versions||[];
    if (versionRows.length!==cases.length || cases.some((row: any)=>versionRows.find((current: any)=>current.id===row.id)?.updated_at!==row.updated_at)) return NextResponse.json({error:"Cases changed while loading progress. Refresh the case list before printing.",code:"VERSION_CONFLICT"},{status:409});
    const latestById=latestCaseReportProgress(cases,snapshots,entries,tasks);
    return NextResponse.json({latestById,lastUpdateById:lastCaseReportUpdates(cases,latestById),versionsById:Object.fromEntries(cases.map((row: any)=>[row.id,row.updated_at]))},{headers:{"Cache-Control":"no-store","Server-Timing":`auth;dur=${authenticated-started},data;dur=${Date.now()-authenticated}`}});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Latest case progress could not be loaded."},{status:error instanceof SyntaxError?400:500});
  }
}
