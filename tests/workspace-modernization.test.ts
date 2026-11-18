import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";
import { isPublicUiAsset } from "../lib/public-ui-assets.ts";

const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const require=createRequire(import.meta.url);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test("legacy Allocation printing treats every stored field as text, never executable markup",()=>{
  const html=read("public/demo.html"),start=html.indexOf("    function printAllocationReport() {"),end=html.indexOf("    function allocationPreviewSnapshot()",start);
  assert.ok(start>0&&end>start);
  const malicious='<script>window.untrustedExecuted=true</script><img src=x onerror="window.untrustedExecuted=true">';
  const values:any={clientName:malicious,previousAccPic:malicious,nextAccPic:malicious,previousTaxPic:malicious,nextTaxPic:malicious,allocationYear:malicious};
  let written="",prints=0;
  const popup={document:{write:(value:string)=>written=value,close(){}},focus(){},print(){prints++;}};
  const escapeHtml=(value:any)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
  vm.runInNewContext(html.slice(start,end)+"\nprintAllocationReport();",{window:{open:()=>popup,alert(){assert.fail("unexpected alert");}},state:{allocationYear:2026,selectedPic:malicious,allocationLastReport:[values]},escapeHtml});
  const dom=new JSDOM(written,{runScripts:"dangerously"});
  try{
    assert.equal((dom.window as any).untrustedExecuted,undefined);assert.equal(dom.window.document.querySelectorAll("script,img").length,0);
    assert.equal(dom.window.document.querySelector("td")?.textContent,malicious);assert.ok(dom.window.document.querySelector("p")?.textContent?.includes(malicious));assert.equal(prints,1);
  }finally{dom.window.close();}
});

function config(environment:string){
  const compiled=ts.transpileModule(read("next.config.ts"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const context={exports:{} as any,require:(name:string)=>{assert.ok(["./scripts/workspace-security.cjs","./lib/resource-policy.cjs"].includes(name));return require(`../${name.slice(2)}`);},process:{cwd:()=>"/test",env:{NODE_ENV:environment}}};vm.runInNewContext(compiled,context);return context.exports.default;
}

test("security headers protect framing and plugins without breaking the same-origin iframe or PDF previews",async()=>{
  const rules=await config("production").headers(),headers=new Map(rules[0].headers.map((h:any)=>[h.key,h.value]));
  assert.equal(rules[0].source,"/:path*");assert.equal(headers.get("X-Frame-Options"),"SAMEORIGIN");
  assert.equal(headers.get("X-Content-Type-Options"),"nosniff");assert.equal(headers.get("Referrer-Policy"),"strict-origin-when-cross-origin");
  assert.match(String(headers.get("Content-Security-Policy")),/frame-ancestors 'self'; object-src 'none'; base-uri 'self'/);
  const report=String(headers.get("Content-Security-Policy-Report-Only"));assert.match(report,/script-src 'self' 'report-sample'/);assert.match(report,/frame-src 'self' blob:/);
  assert.doesNotMatch(String(headers.get("Permissions-Policy")),/notifications|clipboard/);
});

test("production extracts head styles, compacts runtime formatting and protects generated HTML",async()=>{
  const {buildWorkspace}=require("../scripts/build-workspace-shell.cjs"),built=buildWorkspace({write:false}),source=read("public/demo.html");
  const stripScript=(html:string)=>html.slice(html.indexOf("</head>")).replace(/<script>([\s\S]*?)<\/script>/,"<script></script>");
  assert.equal(stripScript(built.html),stripScript(source),"body markup and script order are preserved");
  const {minify_sync}=require("next/dist/compiled/terser/bundle.min.js");
  const compact=(code:string)=>minify_sync(code,{compress:false,mangle:false,ecma:2022,format:{comments:false,inline_script:true}}).code;
  const runtime=(html:string)=>html.match(/<script>([\s\S]*?)<\/script>/)![1];
  assert.equal(compact(runtime(source)),runtime(built.html));assert.equal(compact(runtime(built.html)),runtime(built.html),"formatting is deterministic");
  assert.ok(built.scriptBytes<built.scriptSourceBytes*.87);assert.ok(built.htmlBytes<built.sourceBytes*.74);
  assert.ok(built.htmlBytes<built.sourceBytes*.87);assert.match(built.css,/@container my-work/);assert.match(built.css,/\.submenu/);
  assert.match(built.html,/<style data-workspace-critical>/);assert.match(built.html,/WorkspaceStyleReady/);assert.doesNotMatch(built.html.slice(0,built.html.indexOf("</head>")),/href="submenu-tabs.css"/);
  const prod=await config("production").rewrites(),dev=await config("development").rewrites();assert.equal(prod.beforeFiles[0].source,"/demo.html");assert.equal(prod.beforeFiles[0].destination,"/workspace-built.html");assert.equal(dev.beforeFiles.length,0);
  for(const path of ["/workspace-modals.js","/workspace-shell.css","/fonts/PlusJakartaSans.ttf"])assert.equal(isPublicUiAsset(path,"GET"),true);
  for(const path of ["/workspace-built.html","/demo.html","/workspace-shell.css/private","/fonts/PlusJakartaSans.ttf/private"])assert.equal(isPublicUiAsset(path,"GET"),false);
  assert.doesNotMatch(read("app/globals.css"),/fonts\.googleapis|@import\s+url\(/);assert.match(read("app/globals.css"),/font-display: swap/);
  assert.ok(readFileSync(new URL("../public/fonts/PlusJakartaSans.ttf",import.meta.url)).length>10000);
});

test("extracted styles switch to screen only after readiness and surface loading failures",async()=>{
  const {html}=require("../scripts/build-workspace-shell.cjs").buildWorkspace({write:false});
  const script=html.match(/<script data-workspace-style-ready>([\s\S]*?)<\/script>/)![1];
  for(const success of [true,false]){
    const dom=new JSDOM('<link id="workspace-shell-style" rel="stylesheet" media="print">',{runScripts:"outside-only"}),w=dom.window as any;
    try{w.eval(script);const link=w.document.querySelector("link");assert.equal(link.media,"print");link.dispatchEvent(new w.Event(success?"load":"error"));
      if(success){await w.WorkspaceStyleReady;assert.equal(link.media,"all");assert.equal(w.document.documentElement.classList.contains("workspace-style-ready"),true);}else{await assert.rejects(w.WorkspaceStyleReady,/styles could not be loaded/);assert.equal(w.document.documentElement.classList.contains("workspace-style-ready"),false);}
    }finally{w.close();}
  }
});

function modalFixture(){
  const dom=new JSDOM('<button id="settings" data-open-settings>Settings</button><button id="logout">Logout</button><div id="modal-root"></div>',{runScripts:"outside-only"}),w=dom.window as any;
  w.HTMLDialogElement.prototype.showModal=function(){this.__invoker=w.document.activeElement;this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.__invoker?.focus();};
  const opener=w.document.getElementById("settings");opener.focus();w.eval(read("public/workspace-modals.js"));
  const root=w.document.getElementById("modal-root"),open=(busy=false)=>{root.innerHTML=`<div class="client-editor-backdrop"><section role="dialog" aria-modal="true" aria-label="Edit client" aria-busy="${busy}"><input aria-label="Client name"><button data-close-client-editor ${busy?"disabled":""}>Close</button></section></div>`;};
  root.addEventListener("click",(event:any)=>{if(event.target.matches("[data-close-client-editor]"))root.replaceChildren();});
  const cancel=()=>{const event=new w.Event("cancel",{cancelable:true});w.document.querySelector("dialog").dispatchEvent(event);return event;};
  return {dom,w,root,open,opener,cancel};
}

test("modal bridge uses native focus/top layer and Escape invokes the original close action",async()=>{
  const d=modalFixture();try{
    d.open();await tick();const host=d.w.document.querySelector("dialog");assert.ok(host.open);assert.equal(host.getAttribute("aria-label"),"Edit client");
    assert.equal(host.querySelector('[role="dialog"]'),null);assert.equal(d.w.document.activeElement,host.querySelector("input"));
    assert.equal(d.cancel().defaultPrevented,true);await tick();assert.equal(d.w.document.querySelector("dialog"),null);assert.equal(d.w.document.activeElement,d.opener);
    assert.equal(d.w.document.body.style.overflow,"");
  }finally{d.dom.window.close();}
});

test("Escape cannot bypass a modal save lock; rerenders and removed roots clean up hosts",async()=>{
  const d=modalFixture();try{
    d.open(true);await tick();d.cancel();await tick();assert.equal(d.w.document.querySelector("dialog").open,true);assert.match(d.root.textContent,/wait for the current save/);
    d.open(false);await tick();assert.equal(d.w.document.querySelectorAll("dialog").length,1);assert.equal(d.w.document.activeElement.tagName,"INPUT");
    d.cancel();await tick();assert.equal(d.w.document.querySelectorAll("dialog").length,0);
    d.open();await tick();d.root.remove();await tick();assert.equal(d.w.document.querySelectorAll("dialog").length,0);
  }finally{d.dom.window.close();}
});

test("Settings can rerender in its native host, while non-modal popovers are left alone",async()=>{
  const d=modalFixture();try{
    const html='<div class="appearance-settings-backdrop"></div><section class="appearance-settings" role="dialog" aria-modal="true" aria-label="Settings"><button data-close-appearance-settings>Close</button><input></section>';
    d.root.innerHTML=html;await tick();const host=d.w.document.querySelector("dialog");assert.ok(host.contains(d.root));assert.equal(d.w.document.activeElement.textContent,"Close");
    d.root.innerHTML=html;await tick();assert.equal(d.w.document.querySelectorAll("dialog").length,1);assert.equal(d.w.document.activeElement.textContent,"Close");
    d.root.innerHTML="";await tick();assert.ok(d.root.isConnected);assert.equal(d.root.closest("dialog"),null);
    d.root.innerHTML='<section role="dialog" aria-label="Notification Center">Notifications</section>';await tick();assert.equal(d.w.document.querySelector("dialog"),null);
  }finally{d.dom.window.close();}
});

test("ordinary status updates do not trigger document-wide modal scans",async()=>{
  const d=modalFixture();try{
    let scans=0;const original=d.w.document.querySelectorAll.bind(d.w.document);
    d.w.document.querySelectorAll=(selector:string)=>{scans++;return original(selector);};
    d.root.innerHTML='<p role="status">Saved</p>';await tick();assert.equal(scans,0);
    d.open();await tick();assert.ok(scans>0);assert.equal(d.w.document.querySelector("dialog").open,true);
  }finally{d.dom.window.close();}
});
