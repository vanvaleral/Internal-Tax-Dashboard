import { createHash } from "node:crypto";
import taxCatalog from "../public/case-tax-types.js";
export const CASE_TAX_TYPES = taxCatalog.taxes;
type Document = { number: string; date: string };
export type CasePsa = { id:string; requested:number; application:string; date:string; status:"Draft"|"Diajukan"|"Dalam proses"|"Disetujui"|"Disetujui sebagian"|"Ditolak"; note:string; decision?:Document & {amount:number} };
export type CaseAssessment = Document & { type:"SKP"|"STP"; principal:number; penalty:number; psa:CasePsa|null };
type Product = { id: string; tax: string; period: string; amount: number; revise: boolean; filing: Document | null; assessment?:CaseAssessment };
type Schedule = { id: string; productId: string; due: string; amount: number };
type Payment = { id: string; scheduleId: string; amount: number; date: string; proof: string; verified: boolean };
export type CaseWorkflow = {
  result: (Document & { kind: string; outcome: string; text: string }) | null;
  products: Product[]; schedule: Schedule[]; payments: Payment[];
  revisionTarget: string; response: Document | null; final: Document | null;
  examinationClosure?:Document;
  removedProgress?:{id:string; reason:string; actorId:string; at:string; restoredAt?:string; entry:string; creatorId:string}[];
  events: { id: string; fingerprint: string; action: string; text: string; actorId: string; actor: string; at: string }[];
};
export const emptyCaseWorkflow = (): CaseWorkflow => ({ result:null, products:[], schedule:[], payments:[], revisionTarget:"", response:null, final:null, events:[] });
export class CaseWorkflowError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const fail = (text: string): never => { throw new CaseWorkflowError(text); };
const text = (value: unknown, label: string, max = 200) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) return fail(`${label} is required (maximum ${max} characters).`);
  return value.trim();
};
function day(value: unknown, label: string, today: string, actual = false): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + "T00:00:00Z")) || new Date(value + "T00:00:00Z").toISOString().slice(0,10) !== value) return fail(`Enter a valid ${label}.`);
  if (actual && value > today) return fail(`${label} cannot be in the future.`);
  return value;
}
function amount(value: unknown, positive = false): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) return fail("Amounts must be safe whole rupiah values, not decimals or negative numbers.");
  return value;
}
export function caseWorkflowStatus(w: CaseWorkflow) {
  const payable = w.products.reduce((sum,p)=>sum+p.amount,0);
  const paid = w.payments.filter(p=>p.verified).reduce((sum,p)=>sum+p.amount,0);
  const settled = Boolean(w.result) && payable === paid;
  const executed = settled && w.products.every(p=>!p.revise || Boolean(p.filing));
  return { payable, paid, balance:payable-paid, settled, executed, supervisorAttention:settled && !executed && !w.final && !w.examinationClosure };
}
export function scheduledBalance(w: CaseWorkflow, schedule: Schedule) {
  return schedule.amount - w.payments.filter(p=>p.verified && p.scheduleId===schedule.id).reduce((sum,p)=>sum+p.amount,0);
}
export function canAccessCaseWorkflow(actor: { id: string; role: string }, row: any) {
  return ["leader","supervisor","partner","admin"].includes(actor.role) || [row.tax_pic_profile_id,row.accounting_pic_profile_id].includes(actor.id);
}
const fingerprint = (input: any) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export function caseWorkflowReplay(previous: CaseWorkflow | null, input: any) {
  const event = previous?.events.find(event=>event.id===input?.requestId);
  if (!event) return false;
  if (event.fingerprint !== fingerprint(input)) throw new CaseWorkflowError("This request was already saved with different values. Close and refresh before entering a correction.",409);
  return true;
}
export function applyCaseWorkflowAction(previous: CaseWorkflow | null, input: any, options: { category: string; actorId: string; actorName: string; taxAllowed: boolean; now: string; closed: boolean; leadership?:boolean; progressEntry?:{id:string; entry:string; created_by_profile_id:string} }): CaseWorkflow {
  const action = input?.type;
  const requestId = text(input?.requestId,"Request ID",80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return fail("A valid request ID is required.");
  if (caseWorkflowReplay(previous,input)) return previous!;
  const noteAction=["remove-progress","restore-progress"].includes(action);
  const postExamination=options.category==="Pemeriksaan" && previous?.examinationClosure && ["record-assessment","edit-assessment","psa-route","psa-edit","psa-return","psa-decision","set-plan","record-payment","verify-payment"].includes(action);
  if ((options.closed || previous?.final) && !noteAction && !postExamination) return fail("This case is already closed. Existing history is read-only.");
  const w: CaseWorkflow = structuredClone(previous || emptyCaseWorkflow());
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Makassar",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(options.now));
  const actual = (value: unknown, label: string) => day(value,label,today,true);
  const document = (label: string) => ({number:text(input.number,label),date:actual(input.date,`${label} date`)});
  const status = caseWorkflowStatus(w);
  if (["record-payment","verify-payment","record-filing","record-final","psa-route","psa-edit","psa-return","psa-decision"].includes(action) && !options.taxAllowed) throw new CaseWorkflowError("Only the assigned Tax PIC or leadership can record payments, submissions, PSA or final closure.",403);
  let eventText = "";
  if (noteAction) {
    const entry=options.progressEntry;
    if(!entry || entry.id!==input.entryId) return fail("Choose an existing manual follow-up from this case.");
    if(!options.leadership && entry.created_by_profile_id!==options.actorId) throw new CaseWorkflowError("Only the author or leadership may remove or restore this follow-up.",403);
    w.removedProgress ||= [];
    const removed=w.removedProgress.find(row=>row.id===entry.id);
    if(action==="remove-progress") {
      if(removed&&!removed.restoredAt) return fail("This follow-up is already removed.");
      const value={id:entry.id,reason:text(input.reason,"Removal reason",500),actorId:options.actorId,at:options.now,entry:entry.entry,creatorId:entry.created_by_profile_id};
      if(removed)Object.assign(removed,value,{restoredAt:undefined});else w.removedProgress.push(value);
      eventText=`Incorrect manual follow-up removed: ${value.reason}. Original entry retained.`;
    } else {
      if(!removed||removed.restoredAt)return fail("This follow-up is not removed.");
      removed.restoredAt=options.now;eventText="Previously removed manual follow-up restored.";
    }
  } else if (action === "close-examination") {
    if(options.category!=="Pemeriksaan" || w.examinationClosure)return fail("Choose an open Pemeriksaan to close at SPHP.");
    w.examinationClosure={number:text(input.number,"SPHP reference"),date:input.date?actual(input.date,"SPHP date"):""};
    if(!w.result)w.result={...w.examinationClosure,date:w.examinationClosure.date||today,kind:"SPHP",outcome:"Examination stage closed",text:"Examination closed at SPHP; assessments, payments and PSA remain separately controlled."};
    if(input.assessments!==undefined){
      if(!Array.isArray(input.assessments)||input.assessments.length>100)return fail("Add up to 100 byproducts at closure.");
      input.assessments.forEach((row:any,index:number)=>saveAssessment(w,row,`${requestId}-a${index}`,actual,today));
    }
    eventText=`SPHP ${w.examinationClosure.number} recorded. Examination stage closed; payments and PSA remain active.`;
  } else if (action === "record-assessment" || action === "edit-assessment") {
    if(options.category!=="Pemeriksaan" || !w.examinationClosure)return fail("Close the Pemeriksaan with SPHP before registering SKP / STP.");
    if(action==="edit-assessment"&&!input.productId)return fail("Choose the assessment to edit.");
    const product=saveAssessment(w,input,requestId,actual,today);
    eventText=`${product.assessment!.type} ${product.assessment!.number} ${action==="edit-assessment"?"updated":"registered"}: ${product.tax} / ${product.period}.`;
  } else if (typeof action==="string" && action.startsWith("psa-")) {
    if(options.category!=="Pemeriksaan" || !w.examinationClosure)return fail("PSA requires a closed-at-SPHP examination and registered assessments.");
    if(action==="psa-route"||action==="psa-return") {
      if(!Array.isArray(input.productIds)||!input.productIds.length||input.productIds.length>100||new Set(input.productIds).size!==input.productIds.length)return fail("Select 1 to 100 different assessment documents.");
      for(const id of input.productIds){
        const p=w.products.find(p=>p.id===id),a=p?.assessment;
        if(!p||!a)return fail("An assessment does not belong to this case.");
        if(action==="psa-route"){
          if(a.psa||!a.penalty)return fail("Only unrouted assessments with a positive penalty can enter PSA.");
          a.psa={id:`${requestId}:${id}`,requested:a.penalty,application:"",date:"",status:"Draft",note:""};
        }else{if(!a.psa||a.psa.status!=="Draft")return fail("Only draft PSA requests can be returned. Submitted history requires a reviewed correction.");a.psa=null;}
      }
      eventText=`${input.productIds.length} assessment document(s) ${action==="psa-route"?"linked to PSA":"returned from draft PSA"}. Original liabilities unchanged.`;
    }else{
      const p=w.products.find(p=>p.id===input.productId),a=p?.assessment,psa=a?.psa;
      if(!p||!a||!psa)return fail("Choose a linked PSA request from this case.");
      if(action==="psa-edit"){
        if(psa.decision)return fail("Recorded decisions are read-only. Corrections require retained history.");
        const next=input.status;
        if(!["Draft","Diajukan","Dalam proses"].includes(next)||psa.status!=="Draft"&&next==="Draft")return fail("Choose a valid forward PSA progress; submitted requests cannot return to Draft.");
        const requested=amount(input.requested,true),application=String(input.application||"").trim(),date=input.date?actual(input.date,"Application date"):"";
        if(application.length>200||requested>a.penalty)return fail("The request must fit the assessed penalty and reference limit.");
        if(next!=="Draft"&&(!application||!date))return fail("Application reference and date are required before submission.");
        if(date&&date<a.date)return fail("Application date cannot precede the assessment issue date.");
        if(psa.status!=="Draft"&&(requested!==psa.requested||application!==psa.application||date!==psa.date))return fail("Submitted application details are protected; use a reviewed amendment.");
        Object.assign(psa,{requested,application,date,status:next,note:String(input.note||"").trim().slice(0,1000)});
        eventText=`PSA ${a.number}: ${next}.`;
      } else if(action==="psa-decision"){
        if(psa.decision||psa.status==="Draft"||!psa.application||!psa.date)return fail("Record a submitted application first; an existing decision cannot be overwritten.");
        const decision=document("PSA decision reference"),granted=amount(input.amount),outcome=input.outcome;
        if(decision.date<psa.date)return fail("Decision date cannot precede the application.");
        if(!["Disetujui","Disetujui sebagian","Ditolak"].includes(outcome)||granted>psa.requested||outcome==="Disetujui"&&granted!==psa.requested||outcome==="Ditolak"&&granted!==0||outcome==="Disetujui sebagian"&&!(granted>0&&granted<psa.requested))return fail("Granted amount must match the decision: full, partial, or rejected (zero).");
        psa.status=outcome;psa.decision={...decision,amount:granted};eventText=`PSA ${a.number}: ${outcome}, granted reduction Rp${granted.toLocaleString("id-ID")}. Decision ${decision.number}. Original liability retained.`;
      }else return fail("Unknown PSA action.");
    }
  } else if (action === "record-result") {
    if(options.category==="Pemeriksaan")return fail("Record SPHP and close the examination first, then use the SKP / STP register. Existing results are retained.");
    if(w.examinationClosure)return fail("Use the assessment register after SPHP closure.");
    if (w.result) return fail("A result is already registered. Amendments require a reviewed correction; existing payment history cannot be replaced.");
    const doc = document(options.category === "Himbauan" ? "BA reference" : "SKP reference");
    const outcome = input.outcome;
    if (!["Additional tax / revision","No additional tax"].includes(outcome)) return fail("Choose the result outcome.");
    if (!Array.isArray(input.products) || input.products.length > taxCatalog.maxProducts) return fail(`Add up to ${taxCatalog.maxProducts} tax byproducts.`);
    const seen = new Set();
    const products: Product[] = input.products.map((p: any,index: number)=>{
      if (!p || typeof p!=="object" || !CASE_TAX_TYPES.includes(p.tax) && p.tax!==taxCatalog.otherValue) return fail("Choose a supported tax type or Other and enter its name.");
      const entered=p.tax===taxCatalog.otherValue?text(p.customTax,"Other tax name",80).replace(/\s+/g," "):p.tax;
      const tax=CASE_TAX_TYPES.find(tax=>tax.toLowerCase()===entered.toLowerCase())||entered;
      const period=text(p.period,"Tax period",40),identity=JSON.stringify([tax.toLowerCase(),period.replace(/\s+/g," ").toLowerCase()]);
      if (seen.has(identity)) return fail("The same tax and period appear more than once. Combine them or choose a different period.");
      seen.add(identity);
      return { id:`${requestId}-p${index}`, tax, period, amount:amount(p.amount), revise:p.revise===true, filing:null };
    });
    const total = products.reduce((sum,p)=>sum+p.amount,0);
    if (!Number.isSafeInteger(total)) return fail("The total amount is too large.");
    if (outcome === "Additional tax / revision" && !products.length) return fail("Select at least one tax byproduct.");
    if (outcome === "No additional tax" && total) return fail("A no-additional-tax result cannot contain positive payable amounts.");
    const target = total ? day(input.paymentTarget,"internal payment target",today) : "";
    w.revisionTarget = products.some(p=>p.revise) ? day(input.revisionTarget,"internal revision target",today) : "";
    if (target && target<doc.date || w.revisionTarget && w.revisionTarget<doc.date) return fail("Internal targets cannot precede the result date.");
    w.result = {...doc, kind:options.category === "Himbauan"?"BA":"SKP", outcome, text:text(input.text,"Result",2000)};
    w.products = products;
    w.schedule = products.filter(p=>p.amount>0).map(p=>({id:`${p.id}-s1`,productId:p.id,due:target,amount:p.amount}));
    eventText = `${w.result.kind} ${doc.number} recorded: ${w.result.text}`;
  } else if (action === "record-response") {
    if (options.category !== "Pemeriksaan" || w.response) return fail("An SPHP response is only recorded once for Pemeriksaan.");
    w.response = document("SPHP response reference"); eventText = `SPHP response ${w.response.number} submitted.`;
  } else if (action === "set-plan") {
    if (!w.result) return fail("Record BA / SKP first.");
    const p = w.products.find(p=>p.id===input.productId);
    if (!p || !p.amount) return fail("Choose a payable tax byproduct.");
    if (w.payments.some(receipt=>w.schedule.some(s=>s.productId===p.id && s.id===receipt.scheduleId))) return fail("Receipts already exist. This payment schedule cannot be replaced.");
    const count = Number(input.count);
    if (!Number.isInteger(count) || count<1 || count>12 || count>p.amount) return fail("Choose 1 to 12 nonzero instalments.");
    const first = day(input.date,"first internal payment target",today);
    if (first<(p.assessment?.date||w.result.date)) return fail("Payment targets cannot precede the result date.");
    const [year,month,date] = first.split("-").map(Number);
    w.schedule = w.schedule.filter(s=>s.productId!==p.id);
    for(let i=0;i<count;i++) {
      const start = new Date(Date.UTC(year,month-1+i,1)), last = new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
      const due = new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),Math.min(date,last))).toISOString().slice(0,10);
      w.schedule.push({id:`${requestId}-s${i}`,productId:p.id,due,amount:Math.floor(p.amount/count)+(i===count-1?p.amount%count:0)});
    }
    eventText = `${p.tax} payment plan: ${count} instalment(s), first internal target ${first}.`;
  } else if (action === "record-payment" || action === "verify-payment") {
    if (!w.result) return fail("Record BA / SKP first.");
    const existing = action === "verify-payment" ? w.payments.find(p=>p.id===input.paymentId) : null;
    if (action === "verify-payment" && (!existing || existing.verified)) return fail("Choose an unverified receipt.");
    const s = w.schedule.find(s=>s.id===(existing?.scheduleId || input.scheduleId));
    if (!s) return fail("Payment target not found.");
    const value = existing?.amount ?? amount(input.amount,true);
    // Pending receipts reserve balance too, preventing duplicate receipt entry.
    const reserved = w.payments.filter(p=>p.scheduleId===s.id && p.id!==existing?.id).reduce((sum,p)=>sum+p.amount,0);
    if (value>s.amount-reserved) return fail("Payment exceeds the remaining unrecorded amount of this instalment.");
    const paidDate = existing?.date || actual(input.date,"Payment date");
    const source=w.products.find(p=>p.id===s.productId);
    if (paidDate<(source?.assessment?.date||w.result.date)) return fail("Payment date cannot precede BA / SKP.");
    const verified = action === "verify-payment" || input.verified===true;
    const proof = verified ? text(input.proof,"NTPN / receipt reference") : String(input.proof||"").trim().slice(0,200);
    if (existing) Object.assign(existing,{proof,verified:true});
    else w.payments.push({id:requestId,scheduleId:s.id,amount:value,date:paidDate,proof,verified});
    eventText = `${action === "verify-payment"?"Verified":"Recorded"} payment Rp${value.toLocaleString("id-ID")}${verified?" (receipt verified)":" (awaiting verification)"}.`;
  } else if (action === "record-filing") {
    if (!status.settled) return fail("All payable tax must be verified paid before recording Tax execution.");
    const p = w.products.find(p=>p.id===input.productId && p.revise);
    if (!p || p.filing) return fail("Choose an outstanding required revision.");
    const doc = document("SPT submission receipt / NTTE");
    const earliest = w.payments.filter(p=>p.verified).reduce((latest,p)=>p.date>latest?p.date:latest,w.result!.date);
    if (doc.date<earliest) return fail("Submission cannot precede completed payment / result.");
    p.filing=doc; eventText=`${p.tax} / ${p.period} revision submitted: ${doc.number}.`;
  } else if (action === "record-final") {
    if (!status.executed) return fail("Complete all verified payments and required revisions before closing the case.");
    const doc = document(options.category === "Himbauan"?"SP3P2DK reference":"Examination closure reference");
    const earliest = [...w.payments.filter(p=>p.verified).map(p=>p.date), ...w.products.flatMap(p=>p.filing?[p.filing.date]:[]),w.result!.date].sort().at(-1)!;
    if (doc.date<earliest) return fail("Closure cannot precede payment, result or revision submission.");
    w.final=doc; eventText=`${options.category === "Himbauan"?"SP3P2DK":"Examination closure"} ${doc.number} recorded. Case closed.`;
  } else return fail("Unknown case workflow action.");
  w.events.push({id:requestId,fingerprint:fingerprint(input),action,text:eventText,actorId:options.actorId,actor:options.actorName,at:options.now});
  return w;
}

function saveAssessment(w:CaseWorkflow,input:any,id:string,actual:(value:unknown,label:string)=>string,today:string):Product {
  const existing=input.productId?w.products.find(p=>p.id===input.productId):null;
  if(input.productId&&!existing)return fail("Assessment not found in this case.");
  if(!existing&&w.result?.kind==="SKP"&&w.products.some(p=>!p.assessment))return fail("Classify the existing legacy liabilities before adding new assessments, to avoid duplicate balances.");
  if(!["SKP","STP"].includes(input.kind))return fail("Choose SKP or STP.");
  const principal=amount(input.principal),penalty=amount(input.penalty),total=principal+penalty;
  if(!Number.isSafeInteger(total)||!Number.isSafeInteger(w.products.filter(p=>p!==existing).reduce((n,p)=>n+p.amount,total)))return fail("Assessment total is too large.");
  const a:CaseAssessment={type:input.kind,number:text(input.number,"Assessment reference"),date:actual(input.date,"Issue date"),principal,penalty,psa:existing?.assessment?.psa||null};
  if(w.examinationClosure?.date&&a.date<w.examinationClosure.date)return fail("Assessment issue date cannot precede the recorded SPHP date.");
  if(w.products.some(p=>p!==existing&&p.assessment?.type===a.type&&p.assessment.number.toLowerCase()===a.number.toLowerCase()))return fail("This assessment reference is already registered in the case.");
  const tax=text(input.tax,"Tax type",80),period=text(input.period,"Tax period",40);
  if(existing){
    const schedules=w.schedule.filter(s=>s.productId===existing.id),receipts=w.payments.filter(p=>schedules.some(s=>s.id===p.scheduleId));
    if(receipts.some(receipt=>receipt.date<a.date))return fail("Issue date cannot follow an already recorded payment.");
    if(!existing.assessment&&total!==existing.amount)return fail("Classifying an older result must preserve its recorded total. Do not create another liability.");
    if(a.psa?.status&&a.psa.status!=="Draft")return fail("The source assessment is protected after PSA submission.");
    if(a.psa&&a.psa.requested>penalty)return fail("Penalty cannot be reduced below the existing PSA request.");
    const changed=total!==existing.amount||tax!==existing.tax||period!==existing.period||existing.assessment&&(a.number!==existing.assessment.number||a.date!==existing.assessment.date||a.type!==existing.assessment.type||principal!==existing.assessment.principal||penalty!==existing.assessment.penalty);
    if(receipts.length&&changed)return fail("Receipts exist. Correct this assessment through a reviewed amendment, not a cell overwrite.");
    if(total!==existing.amount&&schedules.length>1)return fail("An instalment plan exists. Review the plan before changing the amount.");
    if(total!==existing.amount){w.schedule=w.schedule.filter(s=>s.productId!==existing.id);if(total)w.schedule.push({id:`${id}-s1`,productId:existing.id,due:dayTarget(input.paymentTarget,a.date,today),amount:total});}
    Object.assign(existing,{tax,period,amount:total,assessment:a});return existing;
  }
  const p:Product={id,tax,period,amount:total,revise:false,filing:null,assessment:a};
  w.products.push(p);if(total)w.schedule.push({id:`id-${id}-s1`,productId:p.id,due:dayTarget(input.paymentTarget,a.date,today),amount:total});return p;
}
function dayTarget(value:unknown,issue:string,today:string){const due=day(value||today,"internal payment target",today);if(due<issue)return fail("Payment target cannot precede the issue date.");return due;}
