import assert from "node:assert/strict";
import test from "node:test";
import * as annual from "../lib/annual-sheet.ts";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";
import { defaultFeaturePolicy } from "../lib/feature-access.ts";

function fixture() {
  const payload = [
    {id:"legacy", year:2023, reportPic:"Verified PIC", notes:"Historical note", deletedAt:"2025-01-01"},
    {id:"assist", taxYear:2022, assistantProfileIds:["pic"], notes:"Assistant note"},
    {id:"exact", taxYear:"2023", taxPicProfileId:"pic", notes:"Selected note"},
    {id:"hidden", taxYear:2025, taxPicProfileId:"other", notes:"Hidden note"},
    {id:"unassigned", accountingPicProfileId:"pic"}
  ];
  const profile = {id:"pic",role:"staff",display_name:"Verified PIC",team_division:"Accounting Team",directory_active:true};
  const policy = defaultFeaturePolicy(); policy.associate.operations.mode = "enabled";
  const db = mockDatabase({
    operational_workspace_state:[{scope:"annual_accounting",version:7,payload}],
    staff_profiles:[profile], annual_sheet_columns:[], feature_access_settings:[{id:true,policy,version:1}]
  });
  const actor = {admin:db,profile,userId:"auth-user"};
  const bindings={"@/lib/access":{isLeadership:()=>false,currentActor:async()=>actor},"@/lib/annual-sheet":annual};
  const reads=loadRoute("lib/annual-sheet-read.ts",bindings);
  const api=loadRoute("app/api/annual-sheet/route.ts",bindings);
  const bootstrap=loadRoute("app/api/workspace/bootstrap/route.ts",bindings);
  const calls: Array<{p_scope:string;p_year:number}> = [];
  let fullReads = 0;
  const from=db.from.bind(db); db.from=table=>{if(table==="operational_workspace_state") fullReads++;return from(table);};
  const packet = (year:number, version=7) => ({
    version,
    rows:payload.filter(row => (Number(row.taxYear || row.year) || 0) === year),
    yearIndex:payload.map(({taxYear,year,reportPic,taxPicProfileId,assistantProfileIds,accountingPicProfileId}) => ({taxYear,year,reportPic,taxPicProfileId,assistantProfileIds,accountingPicProfileId}))
  });
  db.rpc=async(name,args)=>{
    assert.equal(name,"read_annual_sheet_year");
    calls.push(args);
    return {data:packet(args.p_year),error:null};
  };
  return {actor,reads,db,api,bootstrap,calls,packet,fullReads:()=>fullReads};
}

test("selected-year and year zero use the database projection without reading full workspace history",async()=>{
  const f=fixture();
  const response=await f.api.GET(request({}, "?team=accounting&part=sheet&year=2023"));
  assert.equal(response.status,200);
  assert.deepEqual(Array.from(response.body.rows,(row:any)=>row.id),["legacy","exact"]);
  assert.deepEqual(Array.from(response.body.availableYears),[2023,2022,0]);
  assert.equal(response.body.rows[0].deletedAt,"2025-01-01");
  assert.equal(response.body.version,7);
  assert.doesNotMatch(JSON.stringify(response.body),/Hidden note|Assistant note|yearIndex/);
  const zero=await f.reads.readAnnualSheet(f.actor,"accounting",0);
  assert.deepEqual(Array.from(zero.rows,(row:any)=>row.id),["unassigned"]);
  const assisted=await f.reads.readAnnualSheet(f.actor,"accounting",2022);
  assert.equal(assisted.rows[0].id,"assist");
  assert.equal(assisted.rows[0].canManageRow,false);
  assert.equal(f.fullReads(),0);
  assert.deepEqual(f.calls.map(args=>args.p_year),[2023,0,2022]);
});

test("Annual bootstrap chooses only an authorized fallback year when the default has no visible rows",async()=>{
  const f=fixture();
  const result=await f.bootstrap.GET(new Request("https://test.local/api/workspace/bootstrap?view=matrix-view&mode=annual&team=accounting"));
  const data=result.body.packets["annual:accounting"];
  assert.equal(data.sheetYear,2023);
  assert.equal(f.calls.length,2);
  assert.equal(f.calls.at(-1)?.p_year,2023);
  assert.equal(f.fullReads(),0);
});

test("missing RPC, mismatched versions or an incomplete year fall back to the authorized legacy read",async()=>{
  for (const cause of ["missing","version","incomplete"]) {
    const f=fixture();
    f.db.rpc=async(_name,{p_year})=>{
      if(cause==="missing") return {data:null,error:{code:"PGRST202",message:"Not installed"}};
      const data=f.packet(p_year,cause==="version" && p_year===2023?8:7);
      return {data:{...data,rows:cause==="incomplete"?[]:data.rows},error:null};
    };
    const result=await f.reads.readAnnualSheet(f.actor,"accounting",cause==="version"?"auto":2023);
    assert.equal(result.version,7);
    assert.deepEqual(Array.from(result.rows,(row:any)=>row.id),["legacy","exact"]);
    assert.equal(f.fullReads(),1);
  }
});

test("permission or network errors do not silently switch to the legacy read",async()=>{
  const f=fixture();
  f.db.rpc=async()=>({data:null,error:{code:"42501",message:"Permission denied"}});
  await assert.rejects(f.reads.readAnnualSheet(f.actor,"accounting",2023),/Permission denied/);
  assert.equal(f.fullReads(),0);
});
