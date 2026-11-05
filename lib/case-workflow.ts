import { createHash } from "node:crypto";
export const CASE_TAX_TYPES = ["PPh Pasal 29", "PPh Pasal 21", "PPh Pasal 23", "PPh Pasal 4 ayat (2)", "PPN"];
type Document = { number: string; date: string };
type Product = { id: string; tax: string; period: string; amount: number; revise: boolean; filing: Document | null };
type Schedule = { id: string; productId: string; due: string; amount: number };
type Payment = { id: string; scheduleId: string; amount: number; date: string; proof: string; verified: boolean };
export type CaseWorkflow = {
  result: (Document & { kind: string; outcome: string; text: string }) | null;
  products: Product[]; schedule: Schedule[]; payments: Payment[];
  revisionTarget: string; response: Document | null; final: Document | null;
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
  return { payable, paid, balance:payable-paid, settled, executed, supervisorAttention:settled && !executed && !w.final };
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
export function applyCaseWorkflowAction(previous: CaseWorkflow | null, input: any, options: { category: string; actorId: string; actorName: string; taxAllowed: boolean; now: string; closed: boolean }): CaseWorkflow {
  const action = input?.type;
  const requestId = text(input?.requestId,"Request ID",80);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return fail("A valid request ID is required.");
  if (caseWorkflowReplay(previous,input)) return previous!;
  if (options.closed || previous?.final) return fail("This case is already closed. Existing history is read-only.");
  const w: CaseWorkflow = structuredClone(previous || emptyCaseWorkflow());
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Makassar",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(options.now));
  const actual = (value: unknown, label: string) => day(value,label,today,true);
  const document = (label: string) => ({number:text(input.number,label),date:actual(input.date,`${label} date`)});
  const status = caseWorkflowStatus(w);
  if (["record-payment","verify-payment","record-filing","record-final"].includes(action) && !options.taxAllowed) throw new CaseWorkflowError("Only the assigned Tax PIC or leadership can record payments, submissions or final closure.",403);
  let eventText = "";
  if (action === "record-result") {
    if (w.result) return fail("A result is already registered. Amendments require a reviewed correction; existing payment history cannot be replaced.");
    const doc = document(options.category === "Himbauan" ? "BA reference" : "SKP reference");
    const outcome = input.outcome;
    if (!["Additional tax / revision","No additional tax"].includes(outcome)) return fail("Choose the result outcome.");
    if (!Array.isArray(input.products) || input.products.length > CASE_TAX_TYPES.length) return fail("Choose up to five tax byproducts.");
    const seen = new Set();
    const products: Product[] = input.products.map((p: any,index: number)=>{
      if (!CASE_TAX_TYPES.includes(p.tax) || seen.has(p.tax)) return fail("Choose each supported tax type at most once.");
      seen.add(p.tax);
      return { id:`${requestId}-p${index}`, tax:p.tax, period:text(p.period,"Tax period",40), amount:amount(p.amount), revise:p.revise===true, filing:null };
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
    if (first<w.result.date) return fail("Payment targets cannot precede the result date.");
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
    if (paidDate<w.result.date) return fail("Payment date cannot precede BA / SKP.");
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
