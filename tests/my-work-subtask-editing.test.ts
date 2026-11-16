import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };

async function fixture(mobile = false) {
  const warnings: string[] = [], writes: any[] = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", error => warnings.push(error.message));
  const dom = new JSDOM(read("public/demo.html"), { url: "http://localhost/demo.html", runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window as any;
  w.localStorage.setItem("tax-practice-v2:step-user", JSON.stringify({ ui: { currentView: "my-work-view" } }));
  w.matchMedia = (query: string) => ({ matches: mobile && /max-width: (760|900)px/.test(query), addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone;
  let task: any = { id: "saved-task", title: "SP2DK work", creatorName: "Ivan", createdAt: 1, done: false, version: "v1", steps: [
    { id: "stable-step", title: "Worksheet", done: false }, { id: "completed-step", title: "Meeting", done: true }
  ] };
  const otherTask={id:"other-task",title:"Another task",creatorName:"Ivan",createdAt:2,done:false,version:"v1",steps:[]};
  let delayed = false, failed = false, release: (() => void) | undefined;
  w.fetch = async (url: string, init: any = {}) => {
    if (url === "/api/my-work" && init.method === "PATCH") {
      const body = JSON.parse(init.body); writes.push(body);
      if (writes.length > 8) throw Error("Unexpected repeated save");
      if (delayed) await new Promise<void>(resolve => { release = resolve; });
      if (failed) return { ok: false, status: 503, json: async () => ({ error: "Database unavailable" }) };
      task = { ...task, ...body, version: `v${writes.length + 1}` };
      return { ok: true, status: 200, json: async () => ({ task: structuredClone(task) }) };
    }
    const body = url === "/api/profile" ? { user: { id: "step-user" }, profile: { id: "ivan", role: "supervisor", display_name: "Ivan", directory_active: true } }
      : url === "/api/my-work" ? { tasks: [task,otherTask] } : { data: [], tasks: [], staff: [], announcements: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  for (const file of ["public/vendor/purify.min.js", "public/workspace-sync.js", "public/feature-access.js", "public/annual-sheet-dashboard.js"]) w.eval(read(file));
  const script=read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1].replace("    })().catch(error =>","    window.__stepDraftTest={state,renderMyWork,loadSharedMyWork};\n    })().catch(error =>");
  await w.eval(script); await tick();
  w.document.querySelector('[data-select-my-work="saved-task"]').click();
  const input = (index = 0) => w.document.querySelector(`[data-my-work-step-title="saved-task:${index}"]`);
  const checkbox = (index = 0) => w.document.querySelector(`[data-my-work-step-done="saved-task:${index}"]`);
  const key = (node: any, key: string) => node.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  return { dom, w, writes, warnings, input, checkbox, key, api:w.__stepDraftTest, server: () => task, delay: () => { delayed = true; }, release: () => { delayed = false; release?.(); }, fail: () => { failed = true; } };
}

const newStep=(d:any)=>d.w.document.getElementById("my-work-step");
const startStep=(d:any,id="saved-task")=>{d.w.document.querySelector(`[data-start-my-work-step="${id}"]`).click();return newStep(d);};
const typeDraft=(d:any,value:string)=>{const input=newStep(d);input.value=value;input.dispatchEvent(new d.w.Event("input",{bubbles:true}));return input;};

test("unsubmitted new-subtask drafts survive redraws, blurred refreshes and other saves on desktop/mobile",async()=>{
  for(const mobile of [false,true]){
    const d=await fixture(mobile);try{
      startStep(d);let input=typeDraft(d,"DRAFT-SECRET: prepare R&D <worksheet>");input.focus();input.setSelectionRange(4,12);
      d.api.renderMyWork();
      assert.notEqual(newStep(d),input);assert.equal(newStep(d).value,"DRAFT-SECRET: prepare R&D <worksheet>");
      assert.equal(d.w.document.activeElement,newStep(d));assert.equal(newStep(d).selectionStart,4);assert.equal(newStep(d).selectionEnd,12);
      newStep(d).blur();await d.api.loadSharedMyWork(true);
      assert.equal(newStep(d).value,"DRAFT-SECRET: prepare R&D <worksheet>");assert.equal(d.writes.length,0);assert.equal(d.server().steps.length,2);
      d.w.document.querySelector('.my-work-detail [data-toggle-my-work-star="saved-task"]').click();await tick();
      assert.equal(newStep(d).value,"DRAFT-SECRET: prepare R&D <worksheet>");assert.equal(d.server().steps.length,2);
      assert.equal(d.w.localStorage.getItem("tax-practice-v2:step-user").includes("DRAFT-SECRET"),false,"draft text is not silently stored in browser persistence");
      assert.match(newStep(d).parentElement.textContent,/Draft.*Enter.*Esc/);assert.deepEqual(d.warnings,[]);
    }finally{d.dom.window.close();}
  }
});

test("new-step drafts stay with their own task when switching tasks or closing and reopening details",async()=>{
  const d=await fixture();try{
    startStep(d);typeDraft(d,"Task A unfinished step");
    d.w.document.querySelector('[data-select-my-work="other-task"]').click();assert.equal(newStep(d),null);
    startStep(d,"other-task");typeDraft(d,"Task B unfinished step");
    d.w.document.querySelector('[data-select-my-work="saved-task"]').click();assert.equal(newStep(d).value,"Task A unfinished step");
    assert.notEqual(d.w.document.activeElement,newStep(d),"switching tasks must not restore the previous task's focus into a different draft");
    d.w.document.querySelector('[data-close-my-work-detail]').click();assert.equal(newStep(d),null);
    d.w.document.querySelector('[data-select-my-work="saved-task"]').click();assert.equal(newStep(d).value,"Task A unfinished step");
    d.w.document.querySelector('[data-select-my-work="other-task"]').click();assert.equal(newStep(d).value,"Task B unfinished step");
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("an earlier pending save finishing after the draft loses focus cannot erase the new subtask text",async()=>{
  const d=await fixture();try{
    d.delay();d.checkbox().click();await tick();startStep(d);typeDraft(d,"Keep typing after an earlier save");newStep(d).blur();
    d.release();await tick();
    assert.equal(newStep(d).value,"Keep typing after an earlier save");assert.equal(d.writes.length,1);assert.equal(d.server().steps.length,2);
    assert.equal(d.server().steps[0].done,true);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("Enter adds a draft exactly once, composition does not submit, and Escape explicitly discards it",async()=>{
  const d=await fixture();try{
    startStep(d);let input=typeDraft(d,"  Submitted new step  ");
    input.dispatchEvent(new d.w.KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true,cancelable:true}));await tick();
    assert.equal(d.writes.length,0);assert.equal(newStep(d).value,"  Submitted new step  ");
    d.key(newStep(d),"Enter");await tick();
    assert.equal(d.writes.length,1);assert.equal(d.server().steps.length,3);assert.equal(d.server().steps[2].title,"Submitted new step");assert.ok(d.server().steps[2].id);assert.equal(d.server().steps[2].done,false);
    assert.equal(newStep(d),null);d.api.renderMyWork();assert.equal(newStep(d),null,"committing cannot recapture the old input as a fresh draft");
    input=startStep(d);assert.equal(input.value,"");typeDraft(d,"Explicitly discarded");d.key(newStep(d),"Escape");await tick();
    assert.equal(newStep(d),null);assert.equal(d.writes.length,1);assert.equal(d.server().steps.length,3);
    assert.equal(startStep(d).value,"");assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("invalid drafts remain editable and leaving warns only for nonempty unsubmitted text",async()=>{
  const d=await fixture();try{
    const leaving=()=>{const event=new d.w.Event("beforeunload",{cancelable:true});d.w.dispatchEvent(event);return event.defaultPrevented;};
    startStep(d);assert.equal(leaving(),false);
    typeDraft(d,"Unsaved new step");assert.equal(leaving(),true);
    for(const value of ["   ","x".repeat(1001)]){
      const input=typeDraft(d,value);d.key(input,"Enter");await tick();
      assert.equal(newStep(d).value,value);assert.equal(input.validity.valid,false);assert.equal(d.writes.length,0);
    }
    d.key(newStep(d),"Escape");assert.equal(leaving(),false);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("a failed new-subtask save retains the submitted step with Retry instead of losing its text",async()=>{
  const d=await fixture();try{
    d.fail();startStep(d);typeDraft(d,"Retain this submitted step");d.key(newStep(d),"Enter");await tick();
    assert.equal(newStep(d),null);assert.equal(d.input(2).value,"Retain this submitted step");
    assert.equal(d.writes.length,1);assert.equal(d.server().steps.length,2);assert.equal(d.api.state.myWork[0].steps.length,3);
    assert.match(d.w.document.querySelector("[data-my-work-save-status]").textContent,/Changes not saved.*Retry/);
    d.api.renderMyWork();assert.equal(d.input(2).value,"Retain this submitted step");assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("clicking subtask text edits it while only its checkbox toggles completion on desktop/mobile", async () => {
  for (const mobile of [false, true]) {
    const d = await fixture(mobile);
    try {
      const input = d.input(); input.click(); input.focus();
      assert.equal(input.closest("label"), null);
      assert.equal(d.checkbox().checked, false); assert.equal(d.writes.length, 0);
      input.value = "Updated worksheet"; d.key(input, "Enter"); await tick();
      assert.equal(d.writes.length, 1); assert.equal(d.writes[0].steps[0].title, "Updated worksheet");
      assert.equal(d.writes[0].steps[0].id, "stable-step"); assert.equal(d.writes[0].steps[0].done, false);
      d.checkbox().click(); await tick();
      assert.equal(d.writes.length, 2); assert.equal(d.server().steps[0].done, true);
      assert.equal(d.server().steps[0].title, "Updated worksheet");
      const complete = d.input(1); complete.click(); complete.focus();
      assert.equal(d.checkbox(1).checked, true); assert.equal(d.writes.length, 2);
      complete.value = "Meeting with client"; complete.dispatchEvent(new d.w.Event("change", { bubbles: true })); await tick();
      assert.equal(d.server().steps[1].id, "completed-step"); assert.equal(d.server().steps[1].done, true);
      assert.equal(d.server().done, false, "parent completion stays independent");
      assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("blur saves a trimmed title once; unchanged/blank titles and Escape cannot enqueue unintended saves", async () => {
  const d = await fixture();
  try {
    let input = d.input(); input.focus(); input.value = "  Revised worksheet  "; input.blur(); await tick();
    assert.equal(d.writes.length, 1); assert.equal(d.server().steps[0].title, "Revised worksheet");
    input = d.input(); input.focus(); input.blur(); await tick(); assert.equal(d.writes.length, 1);
    input = d.input(); input.focus(); input.value = "Discard this"; d.key(input, "Escape"); await tick();
    assert.equal(d.input().value, "Revised worksheet"); assert.equal(d.writes.length, 1);
    input = d.input(); input.focus(); input.value = "   "; d.key(input, "Enter"); await tick();
    assert.equal(input.validity.valid, false); assert.equal(d.writes.length, 1);
    d.key(input, "Escape"); assert.equal(input.validity.valid, true); assert.equal(input.value, "Revised worksheet");
    assert.equal(d.checkbox().checked, false); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("a confirmed earlier save does not replace a focused subtask editor or erase further typing", async () => {
  const d = await fixture();
  try {
    const input = d.input(); input.focus(); d.delay(); input.value = "First title";
    input.dispatchEvent(new d.w.Event("change", { bubbles: true })); await tick();
    assert.match(d.w.document.querySelector("[data-my-work-save-status]").textContent, /Saving/);
    input.value = "Still typing next title";
    d.release(); await tick();
    assert.equal(d.input(), input); assert.equal(input.value, "Still typing next title");
    assert.equal(d.w.document.activeElement, input);
    input.blur(); await tick();
    assert.equal(d.writes.length, 2); assert.equal(d.server().steps[0].title, "Still typing next title");
    assert.equal(d.server().steps[0].id, "stable-step"); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("failed title saves retain the edit with Retry instead of toggling completion or claiming success", async () => {
  const d = await fixture();
  try {
    d.fail(); const input = d.input(); input.focus(); input.value = "Keep this edit";
    input.dispatchEvent(new d.w.Event("change", { bubbles: true })); await tick();
    assert.equal(d.input().value, "Keep this edit"); assert.equal(d.checkbox().checked, false);
    assert.match(d.w.document.querySelector("[data-my-work-save-status]").textContent, /Changes not saved.*Retry/);
    assert.equal(d.server().steps[0].title, "Worksheet"); assert.equal(d.writes.length, 1);
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});
