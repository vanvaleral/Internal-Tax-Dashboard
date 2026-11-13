import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};

async function dashboard(saved:any={},account="sort-user"){
  const warnings:string[]=[],writes:any[]=[],vc=new VirtualConsole();vc.on("jsdomError",error=>warnings.push(error.message));
  const dom=new JSDOM(read("public/demo.html"),{url:"http://localhost/demo.html",runScripts:"outside-only",virtualConsole:vc}),w=dom.window as any;
  const key=`tax-practice-v2:${account}`;
  w.localStorage.setItem(key,JSON.stringify({ui:{currentView:"my-work-view",...saved}}));
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.requestIdleCallback=()=>0;w.setTimeout=()=>0;w.setInterval=()=>0;w.Headers=Headers;w.Response=Response;w.structuredClone=structuredClone;
  const tasks=["a","b","c"].map(id=>({id,title:`Task ${id}`,creatorName:"Ivan",createdAt:1,done:false,version:"v1",favorite:id==="b",favoritedAt:id==="b"?100:0,steps:[]}));
  w.fetch=async(url:string,init:any={})=>{
    if(init.method&&init.method!=="GET")writes.push({url,body:init.body});
    const body=url==="/api/profile"?{user:{id:account},profile:{id:"ivan",role:"supervisor",display_name:"Ivan",directory_active:true}}
      :url==="/api/my-work"?{tasks}: {data:[],tasks:[],staff:[],announcements:[]};
    return {ok:true,status:200,json:async()=>structuredClone(body)};
  };
  for(const file of ["public/vendor/purify.min.js","public/workspace-sync.js","public/feature-access.js","public/my-work-reorder.js","public/annual-sheet-dashboard.js"])w.eval(read(file));
  const script=read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1].replace("    })().catch(error =>","    window.__workOrderTest={state,renderMyWork,loadSharedMyWork};\n    })().catch(error =>");
  await w.eval(script);await tick();
  assert.ok(w.__workOrderTest,warnings.join("\n"));
  const row=(id:string)=>w.document.querySelector(`#my-work-view [data-select-my-work="${id}"]`);
  const ids=()=>[...w.document.querySelectorAll('#my-work-view [data-my-work-sort-group="active"] [data-select-my-work]')].map((node:any)=>node.dataset.selectMyWork);
  const move=(id:string,key:string)=>row(id).dispatchEvent(new w.KeyboardEvent("keydown",{key,altKey:true,bubbles:true,cancelable:true}));
  const savedUi=()=>JSON.parse(w.localStorage.getItem(key)).ui;
  return {dom,w,writes,warnings,ids,row,move,savedUi,api:w.__workOrderTest};
}

test("the real dashboard retains a personal task order through rerenders, data refreshes and reloads without task writes",async()=>{
  const d=await dashboard();let prefs:any;
  try{
    assert.deepEqual(d.ids(),["b","a","c"],"existing favorites-first order remains the initial default");
    const taskSnapshot=JSON.stringify(d.api.state.myWork),beforeWrites=d.writes.length;
    d.move("c","ArrowUp");assert.deepEqual(d.ids(),["b","c","a"]);
    assert.equal(JSON.stringify(d.api.state.myWork),taskSnapshot,"manual ordering does not edit shared task fields");
    assert.equal(d.api.state.myWorkDetailOpen,false);assert.equal(d.writes.length,beforeWrites);
    prefs=d.savedUi();assert.deepEqual(prefs.myWorkOrder.active,["b","c","a"]);
    d.api.renderMyWork();assert.deepEqual(d.ids(),["b","c","a"]);
    await d.api.loadSharedMyWork(true);assert.deepEqual(d.ids(),["b","c","a"]);
    assert.equal(d.writes.length,beforeWrites);assert.deepEqual(d.warnings,[]);
    d.row("a").click();assert.equal(d.api.state.selectedMyWorkId,"a");assert.equal(d.api.state.myWorkDetailOpen,true,"ordinary task clicks still open the drawer");
  }finally{d.dom.window.close();}
  const reload=await dashboard(prefs);try{assert.deepEqual(reload.ids(),["b","c","a"]);assert.deepEqual(reload.warnings,[]);}finally{reload.dom.window.close();}
  const other=await dashboard({},"different-account");try{assert.deepEqual(other.ids(),["b","a","c"],"another account starts with its own layout");}finally{other.dom.window.close();}
});

test("completed and archived monthly task groups remain separate from active tasks",async()=>{
  const d=await dashboard();try{
    const current=Date.now(),old=new Date();old.setMonth(old.getMonth()-1);
    d.api.state.myWork.push(...["done-a","done-b"].map(id=>({id,title:id,done:true,completedAt:current,steps:[]})),...["old-a","old-b"].map(id=>({id,title:id,done:true,completedAt:old.getTime(),steps:[]})));
    d.api.renderMyWork();
    const completed=d.row("done-a").parentElement;assert.match(completed.dataset.myWorkSortGroup,/^completed:/);
    d.move("done-a","ArrowDown");assert.equal(d.api.state.myWork.find((task:any)=>task.id==="done-a").done,true);
    assert.deepEqual([...completed.children].map((row:any)=>row.dataset.selectMyWork),["done-b","done-a"]);
    const month=`${old.getFullYear()}-${String(old.getMonth()+1).padStart(2,"0")}`;
    d.api.state.myWorkTab="archived";d.api.state.myWorkArchivePeriod=month;d.api.renderMyWork();
    const archive=d.row("old-a").parentElement;assert.equal(archive.dataset.myWorkSortGroup,`completed:${month}`);
    d.move("old-a","ArrowDown");assert.deepEqual([...archive.children].map((row:any)=>row.dataset.selectMyWork),["old-b","old-a"]);
    assert.equal(d.api.state.myWork.find((task:any)=>task.id==="old-a").completedAt,old.getTime());
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});
