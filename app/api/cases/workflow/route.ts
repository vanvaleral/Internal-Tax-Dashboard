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
    let progressEntry;
    if(["remove-progress","restore-progress"].includes(body.command?.type)) {
      if(typeof body.command.entryId!=="string"||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.command.entryId))return NextResponse.json({error:"Choose a valid manual follow-up."},{status:400});
      const lookup=await actor.admin.from("tax_case_progress_entries").select("id, entry, created_by_profile_id").eq("id",body.command.entryId).eq("case_id",row.id).maybeSingle();
      if(lookup.error)throw new Error(lookup.error.message);
      if(!lookup.data)return NextResponse.json({error:"Manual follow-up not found in this case."},{status:404});
      progressEntry=lookup.data;
    }
    const now=new Date(),today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Makassar",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
    const workflow = applyCaseWorkflowAction(row.case_workflow,body.command,{
      category:row.case_category,actorId:actor.profile.id,actorName:actor.profile.display_name || actor.profile.full_name,
      taxAllowed:isLeadership(actor.profile.role) || row.tax_pic_profile_id===actor.profile.id,
      now:now.toISOString(),closed:row.stage==="Closed" || Boolean(row.closed_at),leadership:isLeadership(actor.profile.role),progressEntry
    });
    const {data,error:writeError} = await actor.admin.from("tax_cases").update({
      case_workflow:workflow,updated_by_profile_id:actor.profile.id,
      ...(workflow.final?{stage:"Closed",closed_at:workflow.final.date,completion_date:workflow.final.date}:{}),
      ...(body.command?.type==="close-examination"&&workflow.examinationClosure?{stage:"Closed",closed_at:workflow.examinationClosure.date||today,completion_date:workflow.examinationClosure.date||today,sph_p_date:workflow.examinationClosure.date||row.sph_p_date||null}:{}),
    }).eq("id",row.id).eq("updated_at",body.version).is("deleted_at",null).select("*").maybeSingle();
    if (writeError) throw new Error(writeError.message);
    if (!data) return NextResponse.json({error:"Another session saved this case first. Refresh before retrying.",code:"VERSION_CONFLICT"},{status:409});
    return NextResponse.json({data},{headers:responseHeaders()});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Case workflow could not be saved."},{status:error instanceof CaseWorkflowError?error.status:error instanceof SyntaxError?400:500});
  }
}
