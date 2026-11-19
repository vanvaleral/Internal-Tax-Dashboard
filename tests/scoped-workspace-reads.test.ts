import assert from "node:assert/strict";
import test from "node:test";
import {readAllPages} from "../lib/read-all-pages.ts";
import {loadRoute,mockDatabase} from "./route-harness.ts";
import * as annual from "../lib/annual-sheet.ts";
const bindings={"@/lib/access":{isLeadership:(role:string)=>["leader","supervisor","partner","admin"].includes(role)}};

test("complete reads follow actual returned page sizes, detect incomplete responses and never accept duplicates",async()=>{
  const rows=Array.from({length:1201},(_,id)=>({id:String(id)})),offsets:number[]=[];
  const complete=await readAllPages(async(from,to)=>{offsets.push(from);return {data:rows.slice(from,Math.min(to+1,from+137)),count:rows.length,error:null};});
  assert.equal(complete.length,1201);assert.equal(offsets[1],137);
  await assert.rejects(readAllPages(async()=>({data:[],count:2,error:null})),/incomplete/);
  await assert.rejects(readAllPages(async()=>({data:[{id:"same"}],count:2,error:null})),/changed/);
  await assert.rejects(readAllPages(async()=>({data:null,error:{message:"Denied",code:"42501"}})),/Denied/);
  await assert.rejects(readAllPages(async(from)=>from===0?{data:[{id:"first"}],count:2,error:null}:{data:null,error:{message:"Later page failed"}},1),/Later page failed/);
});

test("Clients and Cases read beyond 1000 with unchanged ownership, fee redaction and deleted-case scope",async()=>{
  const db=mockDatabase({client_master:Array.from({length:1201},(_,i)=>({id:`c${i}`,legal_name:`Client ${i}`,tax_pic_profile_id:i%2?"other":"pic",monthly_fee:123})),tax_cases:Array.from({length:1201},(_,i)=>({id:`case${i}`,tax_pic_profile_id:i%2?"other":"pic",created_by:"u",deleted_at:null,created_at:"2026-01-01"}))});
  const readers=loadRoute("lib/workspace-reads.ts",bindings),supervisor={admin:db,profile:{id:"pic",role:"supervisor"},userId:"u"},staff={...supervisor,profile:{id:"pic",role:"staff"}};
  assert.equal((await readers.readClients(supervisor)).data.length,1201);
  assert.equal((await readers.readClients(supervisor,new URLSearchParams({limit:"30",offset:"500"}))).data.length,30);
  const scoped=await readers.readClients(staff);assert.equal(scoped.data.length,601);assert.equal(scoped.data[0].monthly_fee,undefined);
  assert.equal((await readers.readCases(supervisor)).data.length,1201);assert.equal((await readers.readCases(staff)).data.length,601);
  db.tables.tax_cases.push({id:"removed",deleted_at:"2026-01-01",deleted_by_profile_id:"pic"});
  assert.equal((await readers.readCases(staff,true)).data[0].id,"removed");
});

test("My Work current, archive index and month details use identical creator/assignee authorization",async()=>{
  const reads=loadRoute("lib/my-work-read.ts",bindings),month=reads.currentTaskMonth(),past="2020-02";
  assert.equal(reads.currentTaskMonth(new Date("2026-10-31T16:00:00Z")),"2026-11");
  assert.equal(reads.currentTaskMonth(new Date("2026-10-31T15:59:59Z")),"2026-10");
  const task=(id:string,owner:string,done=false,date:string|null=null)=>({id,title:id,created_by_profile_id:owner,created_at:"2020-01-01",is_completed:done,completed_at:date,steps:[{title:"Private steps"}],notes:"Private note"});
  const db=mockDatabase({my_work_tasks:[task("active","pic"),task("recent","pic",true,`${month}-02T00:00:00+08:00`),task("old","pic",true,`${past}-10T00:00:00+08:00`),task("assigned","other",true,`${past}-11T00:00:00+08:00`),task("hidden","other",true,`${past}-12T00:00:00+08:00`)],my_work_task_assignees:[{task_id:"assigned",staff_profile_id:"pic"}],my_work_task_preferences:[]});
  const profile={id:"pic",role:"staff"};
  const current=await reads.readMyWork(db,profile,"current");assert.deepEqual(Array.from(current.tasks,(row:any)=>row.id),["active","recent"]);
  const index=await reads.readMyWork(db,profile,"archive-index");assert.equal(index.archiveMonths[0].count,2);assert.equal(JSON.stringify(index).includes("Private note"),false);assert.equal(index.tasks.length,0);
  const detail=await reads.readMyWork(db,profile,past);assert.deepEqual(new Set(Array.from(detail.tasks,(row:any)=>row.id)),new Set(["old","assigned"]));assert.equal(detail.tasks[0].note,"Private note");
  assert.throws(()=>reads.taskReadScope("2020-13"),/valid/);assert.throws(()=>reads.taskReadScope("bad"),/valid/);
});

test("Annual year-scoped responses preserve permission filtering and retain only touched cross-year rows",()=>{
  const reads=loadRoute("lib/annual-sheet-read.ts",{...bindings,"@/lib/annual-sheet":annual}),staff=[{id:"pic",display_name:"PIC",directory_active:true,team_division:"Accounting Team"}];
  const row=(id:string,year:number,owner="pic")=>({id,taxYear:year,clientName:id,accountingPicProfileId:owner,accountingPic:"PIC",changeLog:[{private:"history"}]});
  const payload=[row("older",2023),row("current",2025),row("hidden",2024,"other")],ctx={workspace:{payload,version:1},staff,columns:[],clients:[],readClients:false};
  const actor={userId:"u",profile:{id:"pic",role:"staff",team_division:"Accounting Team"}};
  const result=reads.annualResponseData(actor,"accounting",ctx,payload,2025);
  assert.deepEqual(Array.from(result.rows,(row:any)=>row.id),["current"]);assert.deepEqual(Array.from(result.availableYears),[2025,2023]);
  const touched=reads.annualResponseData(actor,"accounting",ctx,payload,2025,["older","hidden"]);
  assert.deepEqual(Array.from(touched.rows,(row:any)=>row.id),["older","current"]);
  assert.equal(reads.annualReadYear("0"),0);assert.throws(()=>reads.annualReadYear("2025.5"),/valid/);
});
