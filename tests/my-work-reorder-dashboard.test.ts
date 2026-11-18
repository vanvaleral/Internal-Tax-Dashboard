import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const require=createRequire(import.meta.url);
const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};

async function dashboard(saved:any={},account="sort-user",mobile=false,reducedMotion=false,configure?:(w:any)=>void,production=false){
  const warnings:string[]=[],writes:any[]=[],vc=new VirtualConsole();vc.on("jsdomError",error=>warnings.push(error.message));vc.on("error",(...values:any[])=>warnings.push(values.map(String).join(" ")));
  const dom=new JSDOM(read("public/demo.html"),{url:"http://localhost/demo.html",runScripts:"outside-only",virtualConsole:vc}),w=dom.window as any;
  const key=`tax-practice-v2:${account}`;
  w.localStorage.setItem(key,JSON.stringify({ui:{currentView:"my-work-view",...saved}}));
  w.matchMedia=(query:string)=>({matches:query==="(prefers-reduced-motion: reduce)"?reducedMotion:mobile&&/max-width:\s*(760|900)px/.test(query),addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.requestIdleCallback=()=>0;w.setTimeout=()=>0;w.setInterval=()=>0;w.Headers=Headers;w.Response=Response;w.structuredClone=structuredClone;
  const tasks:any[]=["a","b","c"].map(id=>({id,title:`Task ${id}`,creatorName:"Ivan",createdAt:1,done:false,version:"v1",favorite:id==="b",favoritedAt:id==="b"?100:0,steps:[]}));
  w.fetch=async(url:string,init:any={})=>{
    if(init.method&&init.method!=="GET")writes.push({url,body:init.body});
    if(url==="/api/my-work"&&init.method==="PATCH"){
      const body=JSON.parse(init.body),task=tasks.find(task=>task.id===body.id);
      assert.ok(task,"the favorite save must address a real task");
      Object.assign(task,body,{version:`v${writes.length+1}`,...(typeof body.favorite==="boolean"?{favoritedAt:body.favorite?Date.now():0}:{})});
      return {ok:true,status:200,json:async()=>({task:structuredClone(task)})};
    }
    const body=url==="/api/profile"?{user:{id:account},profile:{id:"ivan",role:"supervisor",display_name:"Ivan",directory_active:true}}
      :url==="/api/my-work"?{tasks}: {data:[],tasks:[],staff:[],announcements:[]};
    return {ok:true,status:200,json:async()=>structuredClone(body)};
  };
  for(const file of ["public/vendor/purify.min.js","public/workspace-sync.js","public/feature-access.js","public/my-work-reorder.js","public/annual-sheet-dashboard.js"])w.eval(read(file));
  configure?.(w);
  const html=production?require("../scripts/build-workspace-shell.cjs").buildWorkspace({write:false}).html:read("public/demo.html");
  const script=html.match(/<script>([\s\S]*?)<\/script>/)![1].replace(/}\)\(\)\.catch\(/,";window.__workOrderTest={state,renderMyWork,loadSharedMyWork,persistDemoState,flushBrowserPreferences,historySnapshot,applyHistorySnapshot};})().catch(");
  await w.eval(script);await tick();
  assert.ok(w.__workOrderTest,warnings.join("\n"));
  const row=(id:string)=>w.document.querySelector(`#my-work-view [data-select-my-work="${id}"]`);
  const ids=()=>[...w.document.querySelectorAll('#my-work-view [data-my-work-sort-group="active"] [data-select-my-work]')].map((node:any)=>node.dataset.selectMyWork);
  const move=(id:string,key:string)=>row(id).dispatchEvent(new w.KeyboardEvent("keydown",{key,altKey:true,bubbles:true,cancelable:true}));
  const savedUi=()=>JSON.parse(w.localStorage.getItem(key)).ui;
  return {dom,w,writes,warnings,tasks,ids,row,move,savedUi,api:w.__workOrderTest};
}

test("task titles are native controls, keyboard opening focuses details, and navigation avoids unrelated renders",async()=>{
  const d=await dashboard();try{
    const button=d.row("a").querySelector(".my-work-open-task");assert.equal(button.tagName,"BUTTON");assert.equal(button.textContent,"Task a");
    assert.equal(d.row("a").getAttribute("role"),"group");assert.equal(d.row("a").getAttribute("tabindex"),"-1");
    assert.equal(d.row("a").querySelector('input[type="checkbox"]').getAttribute("aria-label"),"Complete task: Task a");
    const settings=d.w.document.getElementById("appearance-settings-root"),marker=d.w.document.createElement("span");settings.append(marker);
    let historyWrites=0;d.w.history.replaceState=()=>historyWrites++;button.click();
    assert.equal(d.api.state.selectedMyWorkId,"a");assert.equal(d.w.document.activeElement.id,"my-work-title-detail");assert.ok(marker.isConnected);assert.equal(historyWrites,0);
    d.w.document.querySelector("[data-close-my-work-detail]").click();assert.equal(d.w.document.activeElement,d.row("a").querySelector(".my-work-open-task"));
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("task-local menus, edits and save acknowledgements retain unrelated DOM and avoid history serialization",async()=>{
  for(const production of [false,true]){
    const d=await dashboard({},`scoped-edit-${production}`,false,false,undefined,production);try{
      const roots=["appearance-settings-root","announcement-inbox-root","client-editor-root"];
      const markers=roots.map(id=>{const node=d.w.document.createElement("span");d.w.document.getElementById(id).append(node);return node;});
      let histories=0;d.w.history.replaceState=()=>histories++;d.w.history.pushState=()=>histories++;
      d.row("a").querySelector(".my-work-open-task").click();
      d.w.document.querySelector('[data-open-my-work-menu="due"]').click();assert.equal(d.api.state.myWorkMenu,"due");
      d.w.document.querySelector('button[data-close-my-work-menu]').click();assert.equal(d.api.state.myWorkMenu,"");
      d.row("c").querySelector('[data-toggle-my-work-star="c"]').click();await tick();
      assert.equal(d.tasks.find(task=>task.id==="c").favorite,true);assert.equal(d.ids()[0],"c");
      d.row("a").querySelector('[data-my-work-done="a"]').click();await tick();
      assert.equal(d.tasks.find(task=>task.id==="a").done,true);
      assert.equal(d.writes.length,2,"each business change still reaches the existing save queue");
      assert.ok(markers.every(node=>node.isConnected),"edits and acknowledgements must not rebuild unrelated roots");
      assert.equal(histories,0,"task changes are not browser-history navigation");
      assert.deepEqual(d.warnings,[]);
    }finally{d.dom.window.close();}
  }
});

test("online browser history neither serializes notifications nor restores an old shared inbox",async()=>{
  const d=await dashboard();try{
    d.api.state.announcements=[{id:"current",message:"Current private notice"}];
    const before=structuredClone(d.api.state.announcements),snapshot=d.api.historySnapshot();
    assert.equal(snapshot.announcements,undefined);assert.doesNotMatch(JSON.stringify(snapshot),/Current private notice/);
    d.api.applyHistorySnapshot({...snapshot,announcements:[{id:"stale",message:"Stale notice"}]});
    assert.deepEqual(d.api.state.announcements,before);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("navigation preference writes coalesce, flush the latest selection on page exit and reveal storage failures",async()=>{
  const idle=new Map<number,()=>void>();let sequence=0,storageWrites=0,fail=false;
  const d=await dashboard({},"preference-test",false,false,w=>{
    w.requestIdleCallback=(fn:()=>void)=>{const id=++sequence;idle.set(id,fn);return id;};w.cancelIdleCallback=(id:number)=>idle.delete(id);
    const original=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key:string,value:string){if(key==="tax-practice-v2:preference-test"){storageWrites++;if(fail)throw new Error("Quota exceeded");}return original.call(this,key,value);};
  });try{
    d.api.flushBrowserPreferences();storageWrites=0;idle.clear();
    for(const id of ["a","b","c"])d.row(id).querySelector(".my-work-open-task").click();
    assert.equal(storageWrites,0);assert.equal(idle.size,1);assert.equal(d.api.state.selectedMyWorkId,"c");
    d.w.dispatchEvent(new d.w.Event("pagehide"));assert.equal(storageWrites,1);assert.equal(idle.size,0);assert.equal(d.savedUi().selectedMyWorkId,"c");
    d.api.persistDemoState();assert.equal(storageWrites,2,"business edits retain immediate persistence");
    fail=true;d.api.persistDemoState();assert.match(d.w.document.getElementById("browser-storage-notice").textContent,/Database save status is shown separately/);
    d.api.state.allocationDrafts={client:{nextAccPic:"Ivan"}};const warning=new d.w.Event("beforeunload",{cancelable:true});d.w.dispatchEvent(warning);assert.equal(warning.defaultPrevented,true);
    fail=false;d.w.document.querySelector("#browser-storage-notice button").click();assert.equal(d.w.document.getElementById("browser-storage-notice"),null);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("My Work keeps the list scroll when opening, changing and closing task details on desktop and mobile",async()=>{
  for(const mobile of [false,true]){
    const d=await dashboard({},`scroll-user-${mobile}`,mobile);try{
      d.tasks.push(...Array.from({length:60},(_,index)=>({id:`long-${index}`,title:`Long list task ${index}`,creatorName:"Ivan",createdAt:1,done:false,version:"v1",favorite:false,favoritedAt:0,steps:[]})));
      await d.api.loadSharedMyWork(true);
      const viewport=()=>d.w.document.querySelector("#my-work-view .my-work-task-list");
      let previous=viewport();previous.scrollTop=1260;
      d.row("long-59").click();
      assert.equal(d.api.state.selectedMyWorkId,"long-59");assert.equal(d.api.state.myWorkDetailOpen,true);
      assert.notEqual(viewport(),previous,"exercise real replacement of the scroll container");
      assert.equal(viewport().scrollTop,1260,"opening details must not jump to the first task");
      previous=viewport();previous.scrollTop=1380;d.row("long-58").click();
      assert.equal(viewport().scrollTop,1380,"selecting a different task keeps the latest scroll offset");
      await d.api.loadSharedMyWork(true);assert.equal(viewport().scrollTop,1380,"confirmed background reloads retain the position too");
      d.w.document.querySelector("[data-close-my-work-detail]").click();
      assert.equal(d.api.state.myWorkDetailOpen,false);assert.equal(viewport().scrollTop,1380,"maximizing the left panel keeps its position");
      assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
    }finally{d.dom.window.close();}
  }
});

test("online preferences omit task/notification records while retaining personal ordering and Allocation drafts",async()=>{
  const d=await dashboard({announcements:[{id:"stale",message:"Old private notification"}]},"minimal-storage");try{
    assert.equal(d.api.state.announcements.length,0,"online startup does not resurrect stale notification content");
    d.api.state.myWork[0].note="Private confirmed task note";d.api.state.announcements=[{id:"confirmed",message:"Private confirmed notification"}];
    d.api.state.allocationDrafts={client:{nextAccPic:"Ivan"}};d.api.state.myWorkOrder.active=["c","b","a"];
    d.api.persistDemoState();const saved=d.savedUi();assert.deepEqual(saved.myWork,[]);assert.deepEqual(saved.announcements,[]);
    assert.deepEqual(saved.allocationDrafts,{client:{nextAccPic:"Ivan"}});assert.deepEqual(saved.myWorkOrder.active,["c","b","a"]);
    assert.equal(d.api.state.myWork[0].note,"Private confirmed task note");assert.equal(d.api.state.announcements.length,1);assert.equal(d.writes.length,0);
    const json=d.w.localStorage.getItem("tax-practice-v2:minimal-storage");assert.doesNotMatch(json,/Private confirmed task note|Private confirmed notification/);
  }finally{d.dom.window.close();}
});

test("My Work drawer remains opaque while opening/switching tasks, and clears only its own completed or cancelled animation",async()=>{
  for(const mobile of [false,true]){
    const d=await dashboard({},`opaque-drawer-${mobile}`,mobile);try{
      const before=JSON.stringify(d.api.state.myWork);
      const finish=(node:any,type:string,name="myWorkDrawerEnter")=>{const event=new d.w.Event(type,{bubbles:true});Object.defineProperty(event,"animationName",{value:name});node.dispatchEvent(event);};
      d.row("a").click();let drawer=d.w.document.querySelector(".my-work-detail");
      assert.equal(drawer.classList.contains("is-opening"),true);assert.equal(d.w.getComputedStyle(drawer).opacity,"1");
      assert.equal(d.w.document.querySelectorAll(".my-work-detail input:disabled, .my-work-detail textarea:disabled, .my-work-detail select:disabled").length,0);
      finish(drawer.querySelector(".my-work-card"),"animationend");assert.equal(drawer.classList.contains("is-opening"),true,"child animations must not finish the drawer animation");
      finish(drawer,"animationend","unrelated");assert.equal(drawer.classList.contains("is-opening"),true);
      finish(drawer,"animationend");assert.equal(drawer.classList.contains("is-opening"),false);
      d.row("b").click();drawer=d.w.document.querySelector(".my-work-detail");assert.equal(drawer.classList.contains("is-opening"),true);assert.equal(d.w.getComputedStyle(drawer).opacity,"1");
      finish(drawer,"animationcancel");assert.equal(drawer.classList.contains("is-opening"),false);
      d.api.renderMyWork();assert.equal(d.w.document.querySelector(".my-work-detail").classList.contains("is-opening"),false,"same-task redraws do not restart the entrance");
      d.w.document.querySelector("[data-close-my-work-detail]").click();d.row("b").click();
      assert.equal(d.w.getComputedStyle(d.w.document.querySelector(".my-work-detail")).opacity,"1");
      assert.equal(JSON.stringify(d.api.state.myWork),before);assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
    }finally{d.dom.window.close();}
  }
});

test("My Work drawer has transform-only, non-retained keyframes and honors reduced motion",async()=>{
  const d=await dashboard({},"reduced-drawer",false,true);try{
    const rules=[...d.w.document.styleSheets].flatMap((sheet:any)=>[...sheet.cssRules]);
    const frames=rules.find((rule:any)=>rule.type===7&&rule.name==="myWorkDrawerEnter");assert.ok(frames);
    assert.equal(frames.cssRules.length,2);for(const frame of frames.cssRules){assert.equal(frame.style.getPropertyValue("opacity"),"");assert.ok(frame.style.getPropertyValue("transform"));}
    const entrance=rules.find((rule:any)=>rule.selectorText===".my-work-detail.is-opening");assert.ok(entrance);
    assert.doesNotMatch(entrance.style.getPropertyValue("animation"),/both|forwards/);
    const reduced=rules.find((rule:any)=>rule.conditionText==="(prefers-reduced-motion: reduce)"&&[...rule.cssRules].some((child:any)=>child.selectorText===".my-work-detail.is-opening"&&child.style.getPropertyValue("animation")==="none"));assert.ok(reduced);
    d.row("a").click();const drawer=d.w.document.querySelector(".my-work-detail");assert.equal(drawer.classList.contains("is-opening"),false);assert.equal(d.w.getComputedStyle(drawer).opacity,"1");
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("My Work resets list scroll for archive navigation but preserves it when selecting an archived task",async()=>{
  const d=await dashboard();try{
    const date=new Date();date.setDate(1);date.setMonth(date.getMonth()-1);
    d.api.state.myWork.push(...["archived-a","archived-b"].map(id=>({id,title:id,done:true,completedAt:date.getTime(),steps:[]})));
    d.api.renderMyWork();
    const viewport=()=>d.w.document.querySelector("#my-work-view .my-work-task-list");
    viewport().scrollTop=500;d.w.document.querySelector('[data-my-work-tab="archived"]').click();
    assert.equal(viewport().scrollTop,0,"the month picker does not inherit the Current task offset");
    viewport().scrollTop=200;d.w.document.querySelector("[data-open-my-work-archive-period]").click();
    assert.equal(viewport().scrollTop,0,"opening a month starts at that month's first task");
    viewport().scrollTop=300;d.row("archived-b").click();assert.equal(viewport().scrollTop,300);
    d.w.document.querySelector("[data-close-my-work-archive-period]").click();assert.equal(viewport().scrollTop,0);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

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

test("starring a task moves it to the top even after manual ordering, including from its detail panel",async()=>{
  const d=await dashboard({myWorkOrder:{active:["a","b","c"]}});try{
    assert.deepEqual(d.ids(),["a","b","c"]);
    d.row("c").querySelector('[data-toggle-my-work-star="c"]').click();
    assert.deepEqual(d.ids(),["c","a","b"],"a newly starred task overrides its previous manual position");
    await tick();
    assert.equal(d.tasks.find(task=>task.id==="c").favorite,true);
    assert.deepEqual(d.savedUi().myWorkOrder.active,["c","a","b"]);
    assert.equal(d.api.state.myWorkDetailOpen,false,"clicking a star does not open the drawer");
    assert.equal(d.writes.length,1);assert.equal(JSON.parse(d.writes[0].body).favorite,true);
    assert.equal("myWorkOrder" in JSON.parse(d.writes[0].body),false,"the task API receives no display-order payload");
    await d.api.loadSharedMyWork(true);assert.deepEqual(d.ids(),["c","a","b"]);
    d.row("a").click();
    const list=d.w.document.querySelector("#my-work-view .my-work-task-list");list.scrollTop=420;
    d.w.document.querySelector('.my-work-detail [data-toggle-my-work-star="a"]').click();
    assert.deepEqual(d.ids(),["a","c","b"]);assert.equal(d.w.document.querySelector("#my-work-view .my-work-task-list").scrollTop,420);
    await tick();assert.equal(d.tasks.find(task=>task.id==="a").favorite,true);assert.equal(d.api.state.selectedMyWorkId,"a");
    assert.equal(d.writes.length,2);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("starring without manual ordering keeps favorites-first defaults and completed tasks stay completed",async()=>{
  const d=await dashboard();try{
    d.row("c").querySelector('[data-toggle-my-work-star="c"]').click();assert.equal(d.ids()[0],"c");await tick();
    assert.equal(d.savedUi().myWorkOrder.active,undefined,"starring does not freeze the default sort unless a manual order already exists");
    d.tasks.push({id:"completed-favorite",title:"Completed task",creatorName:"Ivan",createdAt:1,done:true,completedAt:Date.now(),version:"v1",favorite:false,steps:[]});
    await d.api.loadSharedMyWork(true);const before=d.ids();
    d.row("completed-favorite").querySelector('[data-toggle-my-work-star="completed-favorite"]').click();await tick();
    assert.deepEqual(d.ids(),before);assert.equal(d.tasks.find(task=>task.id==="completed-favorite").done,true);
    assert.match(d.row("completed-favorite").parentElement.dataset.myWorkSortGroup,/^completed:/);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
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
