import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const {html,workspaceEntryPolicies,workspaceEntryResponse}=require("../lib/workspace-entry.cjs");
const {scriptHashes}=require("../scripts/workspace-security.cjs");

test("both shell routes use data-free static HTML with an enforced, matching script policy", async () => {
  for (const file of ["app/route.ts","app/dashboard/route.ts"]) {
    const source = read(file);
    assert.match(source, /dynamic = "force-static"/);
    assert.match(source, /return workspaceEntryResponse\(\)/);
    assert.doesNotMatch(source, /createClient|getUser|staff_profiles|cookies\(/);
  }
  const result = workspaceEntryResponse();
  assert.match(result.headers.get("content-type"), /text\/html/);
  assert.equal(await result.text(),html);
  assert.doesNotMatch(html, /<script[^>]+src|\son(?:load|error)=/);
  assert.match(html, /<link rel="manifest" href="\/manifest.webmanifest"/);
  const hashes=scriptHashes(html);
  assert.equal(hashes.length,1);
  assert.deepEqual(workspaceEntryPolicies().map((item:any)=>item.source),["/","/dashboard"]);
  for(const route of workspaceEntryPolicies()){
    const policy=route.headers.find((item:any)=>item.key==="Content-Security-Policy").value;
    assert.equal(policy.match(/(?:^|; )script-src ([^;]+)/)[1],hashes[0]);
    assert.match(policy,/frame-src 'self'/);
    assert.match(policy,/style-src 'sha256-/);
    assert.match(policy,/require-trusted-types-for 'script'; trusted-types 'none'/);
    assert.doesNotMatch(policy,/unsafe-inline|unsafe-eval/);
  }
});

function openShell() {
  const listeners = new Map<string, (event: any) => void>();
  const redirects: string[] = [], marks: string[] = [], messages: any[] = [];
  const location={origin:"https://test.local",replace:(url:string)=>redirects.push(url)};
  const frameWindow={location:new URL("https://test.local/demo.html"),postMessage:(message:any,origin:string)=>messages.push([message.type,origin])};
  const frame={contentWindow:frameWindow,inert:true,addEventListener:(name:string,callback:any)=>listeners.set(name,callback)};
  const attrs = new Map([["aria-busy","true"]]);
  const loader={hidden:false,attrs,setAttribute(name:string,value:string){this.attrs.set(name,value);}};
  const window:any={addEventListener:(name:string,callback:any)=>listeners.set(name,callback)};
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    window, location, document:{getElementById:(id:string)=>id==="workspace-frame"?frame:loader},
    performance:{now:()=>1200,mark:(name:string)=>marks.push(name)}
  });
  return { listeners, redirects, marks, messages, location, frameWindow, frame, loader, window, receive:listeners.get("message")! };
}

test("the entry cover stays in place on iframe mount and opens only for verified readiness", () => {
  const { receive, messages, location, frameWindow, frame, loader, marks, window } = openShell();
  assert.match(html, /<iframe[^>]*\binert>/);
  assert.match(html, /\.workspace-boot\{[^}]*background:#f0f2ee/);
  assert.match(html, /\.workspace-boot\[data-revealing\]\{opacity:0;visibility:hidden;pointer-events:none\}/);
  assert.match(html, /@media\(prefers-reduced-motion:no-preference\)\{\s*\.workspace-boot\[data-revealing\]\{animation:workspace-reveal/);
  assert.deepEqual(messages,[["workspace:status",location.origin]]);
  receive({origin:location.origin,source:frameWindow,data:{type:"dashboard:mounted"}});
  receive({origin:"https://unrelated.invalid",source:frameWindow,data:{type:"dashboard:ready"}});
  receive({origin:location.origin,source:{},data:{type:"dashboard:startup-error"}});
  assert.equal(loader.hidden,false);
  assert.equal(loader.attrs.get("aria-busy"),"true");
  assert.equal(loader.attrs.has("data-revealing"),false);
  assert.equal(frame.inert,true);
  assert.deepEqual(marks,[]);
  receive({origin:location.origin,source:frameWindow,data:{type:"dashboard:ready",timing:{requestMs:850,server:{auth:100,nonTiming:"ignored"}}}});
  receive({origin:location.origin,source:frameWindow,data:{type:"dashboard:ready"}});
  assert.equal(loader.hidden,false);
  assert.equal(loader.attrs.get("aria-busy"),"false");
  assert.equal(loader.attrs.get("aria-hidden"),"true");
  assert.equal(loader.attrs.has("data-revealing"),true);
  assert.equal(frame.inert,false);
  assert.equal(window.__workspaceStartupTiming.readyMs,1200);
  assert.equal(window.__workspaceStartupTiming.requestMs,850);
  assert.equal(window.__workspaceStartupTiming.server.auth,100);
  assert.equal(window.__workspaceStartupTiming.server.nonTiming,undefined);
  assert.deepEqual(marks,["workspace:ready"]);
});

test("a verified startup error reveals the iframe without reporting readiness", () => {
  const { receive, location, frameWindow, frame, loader, marks, window } = openShell();
  receive({origin:location.origin,source:frameWindow,data:{type:"dashboard:startup-error"}});
  assert.equal(loader.hidden,true);
  assert.equal(loader.attrs.get("aria-busy"),"false");
  assert.equal(loader.attrs.has("data-revealing"),false);
  assert.equal(frame.inert,false);
  assert.deepEqual(marks,[]);
  assert.equal(window.__workspaceStartupTiming,undefined);
});

test("iframe login redirects stay same-origin", () => {
  const { listeners, frameWindow, redirects } = openShell();
  frameWindow.location=new URL("https://unrelated.invalid/login");
  listeners.get("load")!({});
  assert.deepEqual(redirects,[]);
  frameWindow.location=new URL("https://test.local/login?error=staff-access-disabled");
  listeners.get("load")!({});
  assert.deepEqual(redirects,[frameWindow.location.href]);
});
