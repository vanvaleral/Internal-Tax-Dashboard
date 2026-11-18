import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import postcss from "postcss";
import { isPublicUiAsset } from "../lib/public-ui-assets.ts";

const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const require=createRequire(import.meta.url);
const {scriptHashes,documentPolicies}=require("../scripts/workspace-security.cjs");
const {buildWorkspace}=require("../scripts/build-workspace-shell.cjs");

test("static script policy authorizes exact template bytes, normalizes Windows endings and rejects new code",()=>{
  const code='\nwindow.example = "approved";\n',hash="'sha256-"+createHash("sha256").update(code).digest("base64")+"'";
  assert.deepEqual(scriptHashes(`<script>${code}</script>`),[hash]);
  assert.deepEqual(scriptHashes(`<script>${code.replace(/\n/g,"\r\n")}</script>`),[hash]);
  assert.deepEqual(scriptHashes('<script src="/owned.js"></script><script type="application/json"> </script>'),[]);
  assert.notDeepEqual(scriptHashes(`<script>${code}window.unexpected=true;</script>`),[hash]);
});

test("all active HTML documents enforce exact inline hashes and block inline event attributes without unsafe-eval",()=>{
  for(const production of [false,true]){
    const policies=documentPolicies(production);assert.equal(policies.length,4);
    for(const {source,headers} of policies){
      const html=source==="/demo.html"?(production?buildWorkspace({write:false}).html:read("public/demo.html")):source==="/workspace-built.html"?buildWorkspace({write:false}).html:read(`public${source}`);
      const dom=new JSDOM(html);try{
        const enforced=headers.find((h:any)=>h.key==="Content-Security-Policy").value;
        assert.match(enforced,/script-src-attr 'none'/);assert.doesNotMatch(enforced.match(/(?:^|; )script-src ([^;]+)/)![1],/unsafe-inline|unsafe-eval/);
        for(const directive of ["connect-src 'self'","https://*.supabase.co wss://*.supabase.co","img-src 'self' data: blob:","font-src 'self' data:","frame-src 'self' blob:","worker-src 'self' blob:","manifest-src 'self'"])assert.ok(enforced.includes(directive));
        if(production)assert.doesNotMatch(enforced,/ws:\/\//);else assert.match(enforced,/ws:\/\/localhost:\*/);
        for(const script of dom.window.document.querySelectorAll("script:not([src])")){
          const hash="'sha256-"+createHash("sha256").update(script.textContent!).digest("base64")+"'";assert.ok(enforced.includes(hash),source);
        }
        for(const node of dom.window.document.querySelectorAll("*"))for(const attr of node.attributes)assert.doesNotMatch(attr.name,/^on/i,`${source}: ${attr.name}`);
        assert.equal(isPublicUiAsset(source,"GET"),false);assert.ok(enforced.length<2048);
      }finally{dom.window.close();}
    }
  }
});

test("Annual stylesheet readiness and failure still signal the loader without inline attributes",()=>{
  const html=read("public/annual-accounting-sheet-demo.html");
  for(const success of [true,false]){
    const dom=new JSDOM(html,{runScripts:"outside-only"}),w=dom.window as any;try{
      const link=w.document.getElementById("sheet-styles");let event="";
      w.addEventListener(success?"sheet-styles-ready":"sheet-styles-error",(e:any)=>event=e.type);
      w.eval(w.document.querySelector("script[data-sheet-styles]").textContent);
      link.dispatchEvent(new w.Event(success?"load":"error"));
      assert.equal(event,success?"sheet-styles-ready":"sheet-styles-error");assert.equal(link.dataset[success?"ready":"failed"],"true");
      if(success)assert.equal(link.media,"all");
    }finally{w.close();}
  }
});

test("sample datasets are separate, guarded to file previews and never public auth-bypass assets",()=>{
  const source=read("public/workspace-demo-fixtures.js"),dashboard=read("public/demo.html");
  assert.doesNotMatch(dashboard,/const DEFAULT_CLIENTS = \[/);assert.doesNotMatch(dashboard,/0614597029902000/);
  assert.match(dashboard,/IS_OFFLINE_DEMO && !window\.WorkspaceDemoFixtures/);
  assert.equal(isPublicUiAsset("/workspace-demo-fixtures.js","GET"),false);assert.equal(isPublicUiAsset("/workspace-navigation.js","GET"),true);
  for(const protocol of ["https:","file:"]){
    const dom=new JSDOM("",{url:protocol==="file:"?"file:///preview/demo.html":"https://fixture.invalid/demo.html",runScripts:"outside-only"}),w=dom.window as any;
    try{w.eval(source);if(protocol==="file:"){assert.equal(Object.keys(w.WorkspaceDemoFixtures).length,5);assert.ok(w.WorkspaceDemoFixtures.DEFAULT_CLIENTS.length>0);}else assert.equal(w.WorkspaceDemoFixtures,undefined);}finally{w.close();}
  }
});

test("offline preview loads its sample module once and gives a retryable error when it cannot load",async()=>{
  for(const success of [true,false]){
    const errors:string[]=[],console=new VirtualConsole();console.on("error",(...values:any[])=>errors.push(values.map(String).join(" ")));
    const dom=new JSDOM(read("public/demo.html"),{url:"file:///preview/demo.html",runScripts:"outside-only",virtualConsole:console}),w=dom.window as any;let loads=0;
    try{
      w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
      w.requestIdleCallback=()=>0;w.setTimeout=()=>0;w.setInterval=()=>0;w.structuredClone=structuredClone;w.Headers=Headers;w.Response=Response;
      const cache=new Map();Object.defineProperty(w,"localStorage",{value:{getItem:(key:string)=>cache.get(key)||null,setItem:(key:string,value:string)=>cache.set(key,value),removeItem:(key:string)=>cache.delete(key)}});w.history.replaceState=()=>{};w.history.pushState=()=>{};
      w.fetch=()=>{throw Error("Offline preview must not make API requests");};
      for(const file of ["vendor/purify.min.js","workspace-sync.js","feature-access.js"])w.eval(read(`public/${file}`));
      const append=w.document.head.append.bind(w.document.head);w.document.head.append=(node:any)=>{append(node);assert.match(node.src,/workspace-demo-fixtures\.js$/);loads++;if(success)w.eval(read("public/workspace-demo-fixtures.js"));queueMicrotask(()=>node.dispatchEvent(new w.Event(success?"load":"error")));};
      await w.eval(read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1]);
      assert.equal(loads,1);assert.deepEqual(errors,[]);if(success){assert.ok(w.WorkspaceDemoFixtures);assert.equal(w.document.getElementById("app-loading-overlay").classList.contains("visible"),false);}else{assert.match(w.document.getElementById("app-loading-message").textContent,/sample data could not be loaded/);assert.equal(w.document.getElementById("app-loading-overlay").classList.contains("visible"),true);}
    }finally{w.close();}
  }
});

test("Tailwind 4 emits the existing shell utilities and custom theme without scanning private artifacts",async()=>{
  const globals=read("app/globals.css"),pkg=JSON.parse(read("package.json"));assert.equal(pkg.devDependencies.tailwindcss,"4.3.5");assert.equal(pkg.devDependencies.autoprefixer,undefined);
  assert.match(globals,/@import "tailwindcss" source\(none\)/);assert.doesNotMatch(globals,/@source.*(?:tmp|output|public)/);
  const plugin=require("@tailwindcss/postcss");const result=await postcss([plugin()]).process(globals,{from:fileURLToPath(new URL("../app/globals.css",import.meta.url))});
  assert.match(result.css,/\.w-full/);assert.match(result.css,/\.border-0/);assert.match(result.css,/\.text-ink/);assert.match(result.css,/\.shadow-panel/);assert.match(result.css,/0f766e/);
});
