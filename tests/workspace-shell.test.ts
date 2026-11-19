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

test("shell readiness messages require the original same-origin iframe and login redirects stay same-origin", () => {
  const listeners = new Map<string, (event: any) => void>();
  const redirects: string[] = [], marks: string[] = [], messages: any[] = [];
  const location={origin:"https://test.local",replace:(url:string)=>redirects.push(url)};
  const frameWindow={location:new URL("https://test.local/demo.html"),postMessage:(message:any,origin:string)=>messages.push([message.type,origin])};
  const frame={contentWindow:frameWindow,addEventListener:(name:string,callback:any)=>listeners.set(name,callback)};
  const loader={hidden:false,setAttribute(){}};
  const window:any={addEventListener:(name:string,callback:any)=>listeners.set(name,callback)};
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    window, location, document:{getElementById:(id:string)=>id==="workspace-frame"?frame:loader},
    performance:{now:()=>1200,mark:(name:string)=>marks.push(name)}
  });
  const receive=listeners.get("message")!;
  assert.deepEqual(messages,[["workspace:status",location.origin]]);
  receive({origin:"https://unrelated.invalid",source:frameWindow,data:{type:"dashboard:mounted"}});
  receive({origin:location.origin,source:{},data:{type:"dashboard:mounted"}});
  assert.equal(loader.hidden,false);
  receive({origin:location.origin,source:frameWindow,data:{type:"dashboard:mounted"}});
  assert.equal(loader.hidden,true);
  receive({origin:location.origin,source:frameWindow,data:{type:"dashboard:ready",timing:{requestMs:850,server:{auth:100,nonTiming:"ignored"}}}});
  assert.equal(window.__workspaceStartupTiming.readyMs,1200);
  assert.equal(window.__workspaceStartupTiming.requestMs,850);
  assert.equal(window.__workspaceStartupTiming.server.auth,100);
  assert.equal(window.__workspaceStartupTiming.server.nonTiming,undefined);
  assert.deepEqual(marks,["workspace:ready"]);
  frameWindow.location=new URL("https://unrelated.invalid/login");
  listeners.get("load")!({});
  assert.deepEqual(redirects,[]);
  frameWindow.location=new URL("https://test.local/login?error=staff-access-disabled");
  listeners.get("load")!({});
  assert.deepEqual(redirects,[frameWindow.location.href]);
});
