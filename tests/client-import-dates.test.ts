import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import * as imports from "../lib/client-import.ts";
import { clientImportWorkbookRows } from "../lib/client-import-workbook.ts";
import { loadRoute, mockDatabase } from "./route-harness.ts";

function parser(role="supervisor"){
  return loadRoute("app/api/clients/parse-import/route.ts",{
    xlsx:XLSX,"@/lib/client-import":imports,"@/lib/client-import-workbook":{clientImportWorkbookRows},
    "@/lib/access":{currentActor:async()=>({profile:{role}}),canUseClientTransfer:({role}: {role:string})=>["leader","supervisor"].includes(role)}
  });
}
async function parse(file:File,role="supervisor"){
  const form=new FormData();form.set("file",file);
  return parser(role).POST({formData:async()=>form});
}
function excel(rows:any[][],format="m/d/yy",date1904=false){
  const sheet=XLSX.utils.aoa_to_sheet(rows);
  for(let r=1;r<rows.length;r++)for(let c=2;c<rows[r].length;c++){
    const cell=sheet[XLSX.utils.encode_cell({r,c})];if(cell&&typeof cell.v==="number")cell.z=format;
  }
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Clients");
  book.Workbook={WBProps:{date1904}};
  return {book,sheet,file:()=>new File([XLSX.write(book,{type:"buffer",bookType:"xlsx"})],"clients.xlsx")};
}

test("importing real Excel date cells does not depend on their display format or swap day/month",async()=>{
  for(const format of ["m/d/yy","dd/mm/yyyy","yyyy-mm-dd","d mmm yyyy"]){
    const d=excel([["clientCode","name","engagementStart","engagementEnd","contractStartedAt","inactivatedAt"],["CL-001","Example",46023,46024,46025,46026]],format);
    const result=await parse(d.file());assert.equal(result.status,200);
    const row=result.body.rows[0];
    assert.equal(row.engagementStart,"2026-01-01",format);assert.equal(row.engagementEnd,"2026-01-02",format);
    assert.equal(row.contractStartedAt,"2026-01-03",format);assert.equal(row.inactivatedAt,"2026-01-04",format);
    assert.equal(result.body.validation[0].errors.length,0);
  }
});

test("Excel's 1904 date system and blank physical rows retain the actual calendar date",async()=>{
  const d=excel([["clientCode","name","engagementStart"],["CL-001","Example",44561],[],["CL-002","Second",44562]],"m/d/yy",true);
  const result=await parse(d.file());assert.equal(result.body.rows.length,2);
  assert.equal(result.body.rows[0].engagementStart,"2026-01-01");assert.equal(result.body.rows[1].engagementStart,"2026-01-02");
  assert.equal(result.body.valid,2);
});

test("CSV keeps ISO and Indonesian day-first text plus leading-zero identifiers intact",async()=>{
  const file=new File(["clientCode,name,npwp,engagementStart,engagementEnd\n000123,Example,0012345678901234,2026-01-01,03/04/2026\n000124,Second,,2024-02-29,\n"],"clients.csv");
  const result=await parse(file),row=result.body.rows[0];
  assert.equal(row.clientCode,"000123");assert.equal(row.npwp,"0012345678901234");assert.equal(row.engagementStart,"2026-01-01");assert.equal(row.engagementEnd,"03/04/2026");
  assert.equal(imports.normalizeImportedDate(row.engagementEnd),"2026-04-03");assert.equal(result.body.valid,2);
});

test("invalid dates and formula-derived dates are rejected rather than silently shifted or cleared",async()=>{
  const csv=new File(["clientCode,name,engagementStart\nCL-001,Invalid,2026-02-29\nCL-002,Invalid day,31/04/2026\nCL-003,Ambiguous,1/2/26\n"],"invalid.csv");
  const result=await parse(csv);assert.equal(result.body.valid,0);assert.equal(result.body.validation.every((row:any)=>row.errors.some((error:string)=>error.includes("engagementStart"))),true);
  const d=excel([["clientCode","name","engagementStart"],["CL-004","Formula",46023]]);d.sheet.C2.f="DATE(2026,1,1)";
  const formula=await parse(d.file());assert.equal(formula.body.valid,0);assert.match(formula.body.validation[0].errors.join(" "),/formula/);
  const phantom=excel([["clientCode","name","engagementStart"],["CL-005","Invalid leap date",60]]);
  assert.equal((await parse(phantom.file())).body.valid,0,"Excel's nonexistent 1900 leap day is not imported as March 1");
});

test("exported client workbooks reimport their dates and categories without mutating the database",async()=>{
  const records=[{id:"existing",client_code:"CL-001",legal_name:"Example",status:"Active",engagement_type:"free_of_charge",engagement_start:"2026-01-01",engagement_end:"2026-12-31",contract_started_at:"2026-01-02",inactivated_at:null}];
  const db=mockDatabase({client_master:structuredClone(records)});
  const route=loadRoute("app/api/clients/export/route.ts",{xlsx:XLSX,"next/server":{NextResponse:Response},"@/lib/access":{currentActor:async()=>({admin:db,profile:{role:"supervisor"}}),isLeadership:()=>true,canUseClientTransfer:()=>true}});
  const exported=await route.GET(),result=await parse(new File([await exported.arrayBuffer()],"exported-clients.xlsx"));
  assert.equal(result.body.valid,1);assert.equal(result.body.rows[0].engagementStart,"2026-01-01");assert.equal(result.body.rows[0].contractStartedAt,"2026-01-02");
  assert.equal(result.body.rows[0].engagementEnd,"2026-12-31");assert.equal(result.body.rows[0].engagementType,"Free of Charge");
  assert.deepEqual(db.tables.client_master,records);
});

test("date-cell normalization does not guess unformatted numbers or change unrelated field/blank semantics",async()=>{
  const d=excel([["clientCode","name","engagementStart","monthlyFee","notes"],["CL-001","Example",46023,2500000,"keep"]]);
  d.sheet.C2.z="General";d.sheet.D2.z="0";
  const result=await parse(d.file());assert.equal(result.body.rows[0].engagementStart,"46023");assert.equal(result.body.valid,0);
  assert.equal(result.body.rows[0].monthlyFee,"2500000");assert.equal(result.body.rows[0].notes,"keep");assert.equal("engagementEnd" in result.body.rows[0],false);
  const blank=await parse(new File(["clientCode,name,engagementStart\nCL-002,Blank,\n"],"blank.csv"));assert.equal(blank.body.rows[0].engagementStart,"");assert.equal(blank.body.valid,1);
  assert.equal((await parse(d.file(),"staff")).status,403);
});
