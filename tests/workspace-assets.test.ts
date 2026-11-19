import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {JSDOM,VirtualConsole} from "jsdom";
import {isPublicUiAsset} from "../lib/public-ui-assets.ts";
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
function assets(){
  const dom=new JSDOM('<base href="https://untrusted.invalid/"><main></main>',{url:"https://dashboard.invalid/demo.html",runScripts:"outside-only"}),w=dom.window as any;
  w.fetch=()=>{throw Error("Code loading must not fetch operational data");};w.eval(read("public/workspace-assets.js"));
  const nodes=()=>[...w.document.querySelectorAll("script[src],link[href]:not(base)")] as any[];
  const finish=(file:string,success=true)=>{const node=nodes().find(n=>(n.src||n.href).endsWith(file));assert.ok(node,file);if(success&&node.tagName==="SCRIPT")w.eval(read(`public/${file}`));node.dispatchEvent(new w.Event(success?"load":"error"));};
  return {dom,w,nodes,finish};
}

test("feature code is idle until requested, coalesces concurrent loads and ignores an untrusted base URL",async()=>{
  const d=assets();try{
    assert.equal(d.nodes().length,0);const a=d.w.WorkspaceAssets.load("cases"),b=d.w.WorkspaceAssets.load("cases");assert.equal(d.nodes().length,3);
    assert.ok(d.nodes().every(n=>(n.src||n.href).startsWith("https://dashboard.invalid/")));
    for(const file of ["case-assessment-dashboard.js","case-report.js","case-workflow-dashboard.css"])d.finish(file);
    await a;await b;assert.equal(d.w.WorkspaceAssets.ready("cases"),true);await d.w.WorkspaceAssets.load("cases");assert.equal(d.nodes().length,3);
    for(const group of ["__proto__","toString","https://untrusted.invalid/code.js"]){assert.equal(d.w.WorkspaceAssets.ready(group),false);await assert.rejects(d.w.WorkspaceAssets.load(group),/Unknown workspace feature/);}
  }finally{d.dom.window.close();}
});

test("failed optional CSS retries without executing successful feature scripts a second time",async()=>{
  const d=assets();try{
    const failure=assert.rejects(d.w.WorkspaceAssets.load("cases"),/Check your connection and retry/);
    d.finish("case-assessment-dashboard.js");d.finish("case-report.js");d.finish("case-workflow-dashboard.css",false);await failure;
    assert.equal(d.nodes().length,2);assert.equal(d.w.WorkspaceAssets.ready("cases"),false);
    const module=d.w.CaseAssessmentUI,retry=d.w.WorkspaceAssets.load("cases");assert.equal(d.nodes().length,3);d.finish("case-workflow-dashboard.css");await retry;assert.equal(d.w.CaseAssessmentUI,module);
    for(const path of ["/workspace-assets.js","/case-report.js","/case-workflow-dashboard.js","/case-workflow-dashboard.css"])assert.equal(isPublicUiAsset(path,"GET"),true);
    for(const path of ["/case-report.js/private","/api/case-report.js","/workspace-demo-fixtures.js"])assert.equal(isPublicUiAsset(path,"GET"),false);
  }finally{d.dom.window.close();}
});

test("shared PSA summaries and filters do not change when the detailed assessment module arrives",()=>{
  const d=assets();try{
    d.w.eval(read("public/case-workflow-dashboard.js"));
    const items=[undefined,"Dalam proses","Disetujui","Disetujui sebagian","Ditolak"].map(status=>({workflow:{result:{},examinationClosure:{},products:[{amount:0,assessment:status?{psa:{status}}:{}}],payments:[]}}));
    const before=JSON.stringify(items),values=()=>items.map(item=>({bucket:d.w.CaseWorkflowUI.bucket(item),summary:d.w.CaseWorkflowUI.summary(item),ongoing:d.w.CaseWorkflowUI.matches(item,"psa-ongoing"),success:d.w.CaseWorkflowUI.matches(item,"psa-successful")}));
    const initial=values();assert.equal(initial[1].bucket,"progress");assert.equal(initial[2].bucket,"done");d.w.eval(read("public/case-assessment-dashboard.js"));assert.deepEqual(values(),initial);assert.equal(JSON.stringify(items),before);
  }finally{d.dom.window.close();}
});

async function dashboard(view="my-work-view",warmAllocation=false){
  const warnings:string[]=[],writes:any[]=[],vc=new VirtualConsole();vc.on("jsdomError",e=>warnings.push(e.message));vc.on("error",(...args:any[])=>warnings.push(args.map(String).join(" ")));
  const dom=new JSDOM(read("public/demo.html"),{url:"http://localhost/demo.html",runScripts:"outside-only",virtualConsole:vc}),w=dom.window as any;
  w.localStorage.setItem("tax-practice-v2:asset-user",JSON.stringify({ui:{currentView:view}}));
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.requestIdleCallback=()=>0;w.setTimeout=()=>0;w.setInterval=()=>0;w.structuredClone=structuredClone;w.Headers=Headers;w.Response=Response;w.alert=()=>{};
  w.fetch=async(url:string,options:any={})=>{if(options.method&&options.method!=="GET"){writes.push(url);throw Error("No write expected");}const body=url==="/api/profile"?{user:{id:"asset-user"},profile:{id:"pic",role:"supervisor",display_name:"Demo PIC",directory_active:true}}:url==="/api/clients"?{data:[{id:"client-a",client_code:"CL-1",legal_name:"Fictional Client",status:"Active",accounting_pic_name:"Demo PIC",tax_pic_name:"Demo PIC"}]}:url==="/api/cases"?{data:[{id:"saved-case",client_name:"Fictional Client",case_category:"Himbauan",created_at:"2026-01-01",updated_at:"v1"}]}:{data:[],tasks:[],staff:[],announcements:[]};return {ok:true,status:200,json:async()=>body};};
  for(const file of ["vendor/purify.min.js","workspace-sync.js","feature-access.js","annual-sheet-dashboard.js","workspace-assets.js","case-tax-types.js","case-workflow-dashboard.js"])w.eval(read(`public/${file}`));
  if(warmAllocation)w.eval(read("public/allocation-sheet.js"));
  const source=read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1].replace("    })().catch(error =>","    window.__assetTest={state,previewAllocation,getCases:()=>taxCases};\n    })().catch(error =>");
  const opening=w.eval(source);if(!["cases-view","allocation-view"].includes(view))await opening;await tick();
  const nodes=()=>[...w.document.head.querySelectorAll('script[src],link[href]')].filter((n:any)=>/(case-assessment-dashboard\.js|case-report\.js|case-workflow-dashboard\.css|allocation-report\.js|allocation-sheet\.js)$/.test(new URL(n.src||n.href).pathname)) as any[];
  const finish=(file:string,success=true)=>{const node=nodes().find(n=>(n.src||n.href).endsWith(file));assert.ok(node,file);if(success&&node.tagName==="SCRIPT")w.eval(read(`public/${file}`));node.dispatchEvent(new w.Event(success?"load":"error"));};
  return {dom,w,warnings,writes,opening,nodes,finish,api:()=>w.__assetTest};
}

test("Cases tools load on navigation without blocking other menus or losing confirmed rows on failure/retry",async()=>{
  const d=await dashboard();try{
    assert.equal(d.nodes().length,0);d.w.document.querySelector('[data-view="cases-view"]').click();await tick();assert.equal(d.nodes().length,3);assert.match(d.w.document.getElementById("cases-view").textContent,/Loading Cases tools/);
    d.finish("case-assessment-dashboard.js");d.finish("case-report.js",false);d.finish("case-workflow-dashboard.css");await tick();
    assert.equal(d.api().getCases()[0].id,"saved-case");assert.ok(d.w.document.querySelector("[data-retry-case-assets]"));
    d.w.document.querySelector("[data-retry-case-assets]").click();await tick();d.w.document.querySelector('[data-view="client-management-view"]').click();
    const view=d.w.document.getElementById("client-management-view"),marker=d.w.document.createElement("span");view.append(marker);
    d.finish("case-report.js");await tick();assert.ok(marker.isConnected,"late feature completion must not redraw another menu");
    d.w.document.querySelector('[data-view="cases-view"]').click();await tick();assert.equal(d.w.document.querySelector("[data-retry-case-assets]"),null);assert.ok(d.w.document.querySelector('[data-case-sheet-row="saved-case"]'));
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Cases startup keeps the initial cover until feature assets and confirmed data are both ready",async()=>{
  const d=await dashboard("cases-view");try{
    assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"),true);assert.equal(d.nodes().length,3);
    for(const file of ["case-assessment-dashboard.js","case-report.js","case-workflow-dashboard.css"])d.finish(file);
    await d.opening;await tick();assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"),false);assert.ok(d.w.document.querySelector('[data-case-sheet-row="saved-case"]'));assert.deepEqual(d.warnings,[]);assert.equal(d.writes.length,0);
  }finally{d.dom.window.close();}
});

test("Allocation reserves a popup before a cold code download, and passes it to the PDF engine exactly once",async()=>{
  const d=await dashboard("my-work-view",true);try{
    d.w.document.querySelector('[data-view="allocation-view"]').click();await tick();let opens=0,previews=0;
    const popup={closed:false,opener:{},document:{title:"",body:{textContent:""}}};d.w.open=()=>{opens++;return popup;};
    const work=d.api().previewAllocation();assert.equal(opens,1);assert.equal(popup.opener,null);assert.match(popup.document.body.textContent,/Preparing/);assert.equal(d.nodes().length,1);
    await d.api().previewAllocation();assert.equal(opens,1,"duplicate clicks cannot open competing previews");
    d.w.AllocationReports={preview:async(snapshot:any,reserved:any)=>{previews++;assert.equal(reserved,popup);assert.equal(snapshot.rows.length,1);}};
    d.nodes()[0].dispatchEvent(new d.w.Event("load"));await work;assert.equal(previews,1);assert.equal(opens,1);assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation load failures retain an explanatory popup, unlock Preview and require an explicit retry",async()=>{
  const d=await dashboard("my-work-view",true);try{
    d.w.document.querySelector('[data-view="allocation-view"]').click();await tick();let opens=0,previews=0;const alerts:string[]=[];
    const popup={closed:false,opener:{},document:{title:"",body:{textContent:""}}};d.w.open=()=>{opens++;return popup;};d.w.alert=(message:string)=>alerts.push(message);
    const failed=d.api().previewAllocation();d.finish("allocation-report.js",false);await failed;
    assert.match(popup.document.body.textContent,/Check your connection and retry/);assert.equal(alerts.length,1);assert.equal(d.w.document.querySelector("[data-preview-allocation]").disabled,false);
    const retry=d.api().previewAllocation();assert.equal(opens,2);d.w.AllocationReports={preview:async()=>{previews++;}};d.nodes()[0].dispatchEvent(new d.w.Event("load"));await retry;
    assert.equal(previews,1);assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("blocked or closed PDF windows cannot trigger a second popup or fetch the PDF engine",async()=>{
  const d=await dashboard();try{
    let previews=0;d.w.open=()=>null;await d.api().previewAllocation();assert.equal(d.nodes().length,0);
    const popup={closed:false,opener:{},document:{title:"",body:{textContent:""}}};d.w.open=()=>popup;
    const pending=d.api().previewAllocation();popup.closed=true;d.w.AllocationReports={preview:async()=>{previews++;}};d.nodes()[0].dispatchEvent(new d.w.Event("load"));await pending;
    assert.equal(previews,0);assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Allocation sheet is fetched only on opening, supports retry, and does not redraw another view",async()=>{
  const d=await dashboard();try{
    const doc=d.w.document, open=(id:string)=>doc.querySelector(`[data-view="${id}"]`).click();
    assert.equal(d.nodes().length,0);
    const meta=doc.createElement("meta");meta.name="workspace-allocation-revision";meta.content="012345abcdef";doc.head.append(meta);
    open("allocation-view");await tick();
    assert.match(doc.getElementById("allocation-view").textContent,/Loading Allocation tools/);
    assert.equal(d.nodes().length,1);
    assert.match(d.nodes()[0].src,/allocation-sheet\.js\?v=012345abcdef$/);
    d.nodes()[0].dispatchEvent(new d.w.Event("error"));await tick();
    doc.querySelector("[data-retry-allocation-sheet]").click();await tick();
    assert.equal(d.nodes().length,1);
    open("my-work-view");await tick();const marker=doc.createElement("span");doc.getElementById("my-work-view").append(marker);
    d.w.eval(read("public/allocation-sheet.js"));d.nodes()[0].dispatchEvent(new d.w.Event("load"));await tick();
    assert.ok(marker.isConnected);
    open("allocation-view");await tick();
    assert.ok(doc.querySelector("[data-allocation-row]"));
    assert.equal(d.nodes().length,1,"no redownload and no PDF engine fetched");
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("saved Allocation startup waits for the sheet and displays confirmed rows",async()=>{
  const d=await dashboard("allocation-view");try{
    const doc=d.w.document,overlay=doc.getElementById("app-loading-overlay");
    assert.ok(overlay.classList.contains("visible"));
    assert.equal(doc.querySelector("[data-allocation-row]"),null);
    d.finish("allocation-sheet.js");await d.opening;await tick();
    assert.equal(overlay.classList.contains("visible"),false);
    assert.ok(doc.querySelector("[data-allocation-row]"));
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("a startup feature error keeps the secure loading cover and never reveals an incomplete Cases workspace",async()=>{
  const d=await dashboard("cases-view");try{
    d.finish("case-assessment-dashboard.js",false);d.finish("case-report.js");d.finish("case-workflow-dashboard.css");await d.opening;await tick();
    assert.match(d.w.document.getElementById("app-loading-message").textContent,/case-assessment-dashboard\.js/);
    assert.equal(d.w.document.getElementById("app-loading-overlay").classList.contains("visible"),true);assert.equal(d.w.document.querySelector("[data-case-sheet-row]"),null);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});
