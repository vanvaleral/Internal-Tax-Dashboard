import { NextRequest, NextResponse } from "next/server";
import { isLeadership } from "@/lib/access";
import { currentCaseActor } from "@/lib/case-access";
import { applyCaseWorkflowAction, canAccessCaseWorkflow, caseWorkflowReplay, CaseWorkflowError } from "@/lib/case-workflow";

export async function PATCH(request: NextRequest) {
  const started = Date.now();
  const actor = await currentCaseActor(request);
  if ("error" in actor) return NextResponse.json({error:actor.error},{status:actor.status});
  const authenticated = Date.now();
  const responseHeaders = () => ({ "Cache-Control":"private, no-store", "Server-Timing":`auth;dur=${authenticated-started},data;dur=${Date.now()-authenticated}` });
  try {
    const body = await request.json();
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({error:"Case ID is required."},{status:400});
    const {data:row,error} = await actor.admin.from("tax_cases").select("*").eq("id",body.id).is("deleted_at",null).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || !canAccessCaseWorkflow(actor.profile,row)) return NextResponse.json({error:"You are not assigned to this case."},{status:403});
    if (!("case_workflow" in row)) return NextResponse.json({error:"The case workflow database migration must be applied first.",code:"MIGRATION_REQUIRED"},{status:503});
    if (caseWorkflowReplay(row.case_workflow,body.command)) return NextResponse.json({data:row,replayed:true},{headers:responseHeaders()});
    if (body.version !== row.updated_at) return NextResponse.json({error:"This case changed in another session. Refresh the case before retrying.",code:"VERSION_CONFLICT"},{status:409});
    const workflow = applyCaseWorkflowAction(row.case_workflow,body.command,{
      category:row.case_category,actorId:actor.profile.id,actorName:actor.profile.display_name || actor.profile.full_name,
      taxAllowed:isLeadership(actor.profile.role) || row.tax_pic_profile_id===actor.profile.id,
      now:new Date().toISOString(),closed:row.stage==="Closed" || Boolean(row.closed_at)
    });
    const {data,error:writeError} = await actor.admin.from("tax_cases").update({
      case_workflow:workflow,updated_by_profile_id:actor.profile.id,
      ...(workflow.final?{stage:"Closed",closed_at:workflow.final.date,completion_date:workflow.final.date}:{}),
    }).eq("id",row.id).eq("updated_at",body.version).is("deleted_at",null).select("*").maybeSingle();
    if (writeError) throw new Error(writeError.message);
    if (!data) return NextResponse.json({error:"Another session saved this case first. Refresh before retrying.",code:"VERSION_CONFLICT"},{status:409});
    return NextResponse.json({data},{headers:responseHeaders()});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Case workflow could not be saved."},{status:error instanceof CaseWorkflowError?error.status:error instanceof SyntaxError?400:500});
  }
}
