import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";
import { applyCaseWorkflowAction } from "../lib/case-workflow.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const html = read("public/demo.html");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const dbCase = (id: string, name: string, tax: string, acc: string, category = "Himbauan"): Record<string, any> => ({
  id, client_id: "master-1", client_name: name, case_type: category, case_category: category,
  tax_pic_profile_id: tax, accounting_pic_profile_id: acc, tax_pic_name: tax, accounting_pic_name: acc,
  letter_number: id, subject: "Original", updated_at: "v1", due_date: "2026-11-20", case_workflow:null,
  created_at: `2026-10-${id === "saved-a" ? "01" : id === "saved-b" ? "02" : "03"}T00:00:00Z`
});

async function dashboard(role = "supervisor", savedUi = {}, offline = false, query = "", expectBlocked = false) {
  const warnings: string[] = [], writes: any[] = [], reads: string[] = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", error => warnings.push(error.message));
  vc.on("error", (...items: any[]) => warnings.push(items.map(item => item?.stack || String(item)).join(" ")));
  const dom = new JSDOM(html, { url: (offline ? "file:///C:/preview/demo.html" : "http://localhost/demo.html") + query, runScripts: "outside-only", virtualConsole: vc });
  const w = dom.window as any;
  if (offline) {
    const cache = new Map();
    Object.defineProperty(w, "localStorage", { value: { getItem:(key: string) => cache.get(key) ?? null, setItem:(key: string, value: string) => cache.set(key, value), removeItem:(key: string) => cache.delete(key) } });
    w.history.replaceState = () => {}; w.history.pushState = () => {};
  }
  w.localStorage.setItem(`tax-practice-v2:${offline ? "offline-preview" : "auth-user-1"}`, JSON.stringify({ ui: { currentView: "cases-view", casesTab: "himbauan", ...savedUi } }));
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone;
  w.HTMLDialogElement.prototype.showModal = function() { this.setAttribute("open", ""); };
  w.HTMLDialogElement.prototype.close = function() { this.removeAttribute("open"); };
  const rows = [dbCase("saved-a", "Alpha", "tax-a", "acc-a"), dbCase("saved-b", "Beta", "tax-b", "acc-a"), dbCase("saved-c", "Gamma", "tax-a", "acc-b"), dbCase("saved-d", "Delta", "tax-a", "acc-a", "Pemeriksaan")];
  let hold: ((value: any) => void) | undefined;
  let delay = false, fail = false, failId = "", created = 0, announcementStatus = "delivered";
  const announcements: any[] = [];
  w.fetch = async (url: string, init: any = {}) => {
    if (url === "/api/cases/report") {
      reads.push(url);const ids=JSON.parse(init.body).caseIds;
      return {ok:true,status:200,json:async()=>({latestById:Object.fromEntries(ids.map((id:string)=>[id,{entry:"Latest saved PIC follow-up",creatorName:"tax-a",createdAt:"2026-11-05T07:00:00Z",source:"Follow-up"}])),lastUpdateById:Object.fromEntries(ids.map((id:string)=>[id,{creatorName:"tax-a",createdAt:"2026-11-05T07:00:00Z",source:"Follow-up"}])),versionsById:Object.fromEntries(ids.map((id:string)=>[id,rows.find(row=>row.id===id)?.updated_at]))})};
    }
    if (init.method && init.method !== "GET") {
      const body = JSON.parse(init.body); writes.push(body);
      if (delay) await new Promise(resolve => { hold = resolve; });
      if (fail || failId && body.id === failId) return { ok: false, status: 409, json: async () => ({ error: "Case was changed by another user. Reload before editing." }) };
      if (body.action === "add-progress") return { ok:true, status:200, json:async()=>({progressEntry:{id:`note-${writes.length}`,entry:body.entry,creatorName:"tax-a",createdAt:"2026-11-06T08:00:00Z"}}) };
      const previous = rows.find(row => row.id === body.id) || (body.id ? dbCase(body.id, body.case?.clientName, "tax-a", "acc-a", body.case?.caseCategory) : { ...dbCase(++created === 1 ? "saved-new" : `saved-new-${created}`, body.case?.clientName, "tax-a", "acc-a", body.case?.caseCategory), created_at:new Date().toISOString() });
      const data: Record<string, any> = { ...previous, client_name: body.case?.clientName || previous.client_name, subject: body.case?.subject ?? previous.subject, letter_number: body.case?.letterNumber ?? previous.letter_number, updated_at: `v${writes.length + 1}` };
      if (url === "/api/cases/workflow") data.case_workflow = applyCaseWorkflowAction(previous.case_workflow,body.command,{category:previous.case_category,actorId:"tax-a",actorName:"tax-a",taxAllowed:true,now:"2026-11-05T08:00:00Z",closed:false});
      if(data.case_workflow?.examinationClosure&&body.command?.type==='close-examination'){data.stage='Closed';data.completion_date=data.case_workflow.examinationClosure.date||'2026-11-05';data.sph_p_date=data.case_workflow.examinationClosure.date||null;data.closed_at=data.completion_date;}
      for (const [field, column] of [["letterDate", "letter_date"], ["receivedDate", "received_date"], ["completionDate", "completion_date"], ["sphpDate", "sph_p_date"]]) {
        if (body.case?.[field] !== undefined) data[column] = body.case[field];
      }
      for (const [field, column] of [["notes", "notes"], ["taxYear", "tax_year"], ["inspectorPic", "inspector_pic"], ["completionNotes", "completion_notes"]]) if (body.case?.[field] !== undefined) data[column] = body.case[field];
      if (body.action === "assign-pic") { data[`${body.picType}_pic_profile_id`] = body.profileId; data[`${body.picType}_pic_name`] = body.profileId; }
      const stored = rows.find(row => row.id === data.id); if (stored) Object.assign(stored, data); else rows.push(data);
      if (url === "/api/cases" && init.method === "POST" && announcementStatus === "delivered") announcements.push({ id:`announcement-${data.id}`, title:`New ${data.case_category}: ${data.client_name}`, message:"New case created", audience:"all", sender:"Supervisor", createdAt:new Date().toISOString(), readAt:null });
      return { ok: true, status: 200, json: async () => ({ data, ...(init.method === "POST" ? { announcementStatus } : {}) }) };
    }
    reads.push(url);
    const body = url === "/api/profile" ? { user: { id: "auth-user-1" }, profile: { id: "tax-a", role, display_name: "tax-a", team_division: "Tax Team", directory_active: true } }
      : url === "/api/clients" ? { data: [{ id: "master-1", client_code: "CL-00001", legal_name: "Alpha", status: "Active", tax_pic_profile_id: "tax-a", accounting_pic_profile_id: "acc-a", tax_pic_name: "tax-a", accounting_pic_name: "acc-a" }] }
      : url === "/api/cases" ? { data: rows }
      : url === "/api/announcements" ? { announcements }
      : url.includes("progressFor=") ? { completedTasks: [{ title: "Linked completed task", completedByName: "tax-a" }], progressEntries: [] }
      : url === "/api/staff" ? { staff: ["tax-a", "tax-b", "acc-a", "acc-b"].map(id => ({ id, display_name: id, directory_active: true, team_division: id.startsWith("tax") ? "Tax Team" : "Accounting Team" })) }
      : { data: [], tasks: [], staff: [], announcements: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  w.eval(read("public/vendor/purify.min.js")); w.eval(read("public/workspace-sync.js")); w.eval(read("public/feature-access.js")); w.eval(read("public/annual-sheet-dashboard.js")); w.eval(read("public/case-assessment-dashboard.js")); w.eval(read("public/case-workflow-dashboard.js")); w.eval(read("public/case-report.js"));
  // Expose closure references in the test source only, never in the served dashboard.
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1].replace("    })().catch(error =>", "    window.__casesTest = { state, renderCases, getRows: () => taxCases, saveCaseSheetCell, saveCaseWorkflow, saveMyWorkTaskToDatabase, myWorkValues, caseTimeline, loadSharedCases, loadCaseProgress, addHimbauanProgress, loadPerformanceLedger, loadStaffDirectory, loadSharedAnnouncements, pasteCaseSheetRange, selectCaseSheetRange, clearCaseSheetRange };\n    })().catch(error =>");
  await w.eval(script.replace('window.__casesTest = { state,','window.__casesTest = { resetAssignedPreload:()=>{assignedCasePreloadTimer=null;assignedCasePreloadAttempts.clear();}, scheduleAssignedCasePreload, assignedCasePreloadIds, caseInactivity, refreshCaseActivityAppearance, state,')); await tick();
  const api = w.__casesTest;
  if (!expectBlocked) assert.ok(api, warnings.join("\n") || w.document.body.textContent.slice(-500));
  return { dom, w, api, rows, writes, reads, warnings, announcements, announcementStatus:(value: string) => { announcementStatus = value; }, delay: () => { delay = true; }, fail: () => { fail = true; }, failCase: (id: string) => { failId = id; }, release: () => { delay = false; hold?.(null); } };
}

const field = (d: any, id: string, name: string) => d.w.document.querySelector(`[data-case-sheet-id="${id}"][data-case-sheet-field="${name}"]`);
const visible = (d: any) => [...d.w.document.querySelectorAll("[data-case-sheet-row]")].map((row: any) => row.dataset.caseSheetRow);
const gridCell = (d: any, id: string, name: string) => d.w.document.querySelector(`[data-case-sheet-row="${id}"] [data-case-grid-field="${name}"]`);
const caseViewport = (d: any) => d.w.document.querySelector('#cases-view [data-virtual-table="cases"]');
const workflowResult = () => ({type:"record-result",requestId:"43047f51-f5a0-413c-9c86-47ef60302a43",number:"BA-INTEGRATION",date:"2026-11-01",outcome:"Additional tax / revision",text:"Agreed result",paymentTarget:"2026-11-05",revisionTarget:"2026-11-06",products:[{tax:"PPN",period:"2025",amount:1000,revise:true}]});

test("Cases scopes remaining-height layout to its dashboard and retains table/footer structure across all categories", async () => {
  const d = await dashboard();
  try {
    const doc = d.w.document;
    assert.equal(doc.body.classList.contains("cases-viewport"), true);
    for (const category of ["himbauan", "pemeriksaan", "register", "psa"]) {
      doc.querySelector(`[data-cases-tab="${category}"]`).click();
      const panel = doc.querySelector("#cases-view .case-sheet-panel");
      assert.ok(panel.querySelector(":scope > .table-wrap"));
      assert.ok(panel.querySelector(":scope > .case-sheet-footer"));
      assert.ok(panel.querySelector(":scope > .case-sheet-tools"));
      assert.equal(doc.body.classList.contains("cases-viewport"), true);
    }
    d.api.state.caseTrashOpen = true;
    d.api.state.deletedCases = Array.from({ length:100 }, (_, index) => ({ id:`archived-${index}`, clientName:`Archived ${index}`, caseCategory:"Himbauan" }));
    d.api.renderCases();
    const archive = doc.querySelector(".workspace-cases > .case-archive-panel");
    assert.equal(archive.querySelectorAll(":scope > .detail-list > .list-item").length, 100);
    assert.ok(doc.querySelector(".workspace-cases > .case-sheet-panel"));
    doc.querySelector('.nav-btn[data-view="profile-view"]').click();
    assert.equal(doc.body.classList.contains("cases-viewport"), false);
    doc.querySelector('.nav-btn[data-view="cases-view"]').click();
    assert.equal(doc.body.classList.contains("cases-viewport"), true);
    assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("desktop Cases and full-screen use flex table scrolling rather than a fixed offset or hidden page overflow", () => {
  const start = html.indexOf("      body.cases-viewport .shell, html.cases-fullscreen .shell");
  assert.ok(start > 0);
  const css = html.slice(start, html.indexOf("  </style>", start));
  assert.match(css, /\.shell \{ height:100dvh; min-height:0; align-items:stretch;/);
  assert.match(css, /\.workspace-cases \{ display:flex; flex-direction:column; height:100%; min-height:0;/);
  assert.match(css, /\.case-sheet-panel \{ display:flex; flex-direction:column; flex:1; height:auto; min-height:0;/);
  assert.match(css, /\.case-sheet-panel > :not\(\.table-wrap\) \{ flex:0 0 auto;/);
  assert.match(css, /\.case-sheet-panel > \.table-wrap \{ flex:1; min-height:0; max-height:none; overflow:auto; overscroll-behavior:contain;/);
  assert.match(css, /\.case-archive-panel \{[^}]*max-height:min\(32dvh, 240px\); overflow:hidden;/);
  assert.match(css, /\.case-archive-panel > \.detail-list \{ min-height:0; overflow:auto;/);
  assert.match(css, /@media \(min-width: 901px\) and \(max-height: 480px\)/);
  assert.doesNotMatch(css, /scrollTop|scrollTo|wheel|body\.cases-viewport\s*\{[^}]*overflow:\s*hidden/);
});

test("standalone Cases does not enable dashboard-specific top-bar sizing", async () => {
  const d = await dashboard("supervisor", {}, false, "?casesFullscreen=1&casesTab=himbauan&account=auth-user-1");
  try {
    assert.equal(d.w.document.documentElement.classList.contains("cases-fullscreen"), true);
    assert.equal(d.w.document.body.classList.contains("cases-viewport"), false);
    assert.ok(caseViewport(d));
    assert.deepEqual(d.warnings, []); assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test('SPHP integration preserves the original sheet while linking editable assessments into both registers',async()=>{
  const d=await dashboard('supervisor',{casesTab:'pemeriksaan'});try{
    const q=(selector:string)=>d.w.document.querySelector(selector),fill=(name:string,value:string)=>{q(`#case-assessment-dialog [name="${name}"]`).value=value;};
    q('[data-toggle-himbauan-progress="saved-d"]').click();await tick();const viewport=caseViewport(d);
    assert.deepEqual([...d.w.document.querySelectorAll('[data-cwf-tab]')].map((e:any)=>e.dataset.cwfTab),['progress','payments','psa']);
    q('[data-ca-action="close-examination"]').click();fill('number','SPHP/LIVE');fill('date','30/10/2026');
    q('[data-ca-stage="STP"]').click();fill('stage-0-period','2025');fill('stage-0-number','STP/LIVE');fill('stage-0-date','01/11/2026');fill('stage-0-principal','0');fill('stage-0-penalty','200.000');fill('stage-0-paymentTarget','05/11/2026');
    q('#case-assessment-dialog form').dispatchEvent(new d.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.equal(q('#case-assessment-dialog'),null);assert.equal(d.api.getRows().find((r:any)=>r.id==='saved-d').stage,'Closed');assert.equal(caseViewport(d),viewport);
    assert.equal(q('[data-ca-edit="number"]').value,'STP/LIVE');const product=d.api.getRows().find((r:any)=>r.id==='saved-d').workflow.products[0];
    q('[data-ca-edit="number"]').value='STP/REVISED';q('[data-ca-edit="number"]').dispatchEvent(new d.w.Event('change',{bubbles:true}));await tick();
    assert.equal(product.assessment.number,'STP/LIVE','old object is not mutated before server confirmation');
    assert.equal(d.api.getRows().find((r:any)=>r.id==='saved-d').workflow.products[0].assessment.number,'STP/REVISED');
    q('[data-cases-tab="register"]').click();await tick();assert.equal(d.api.state.casesTab,'register');assert.equal(q('[data-ca-edit="number"]').value,'STP/REVISED');
    assert.equal(q('[data-case-fullscreen]').href.includes('casesTab=register'),true);assert.ok(q('[data-case-resize="assessmentTotal"]'));
    const selection=q('[data-ca-select]');selection.checked=true;selection.dispatchEvent(new d.w.Event('change',{bubbles:true}));q('[data-ca-action="psa-route"]').click();
    q('#case-assessment-dialog form').dispatchEvent(new d.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
    q('[data-cases-tab="psa"]').click();await tick();assert.equal(d.api.state.casesTab,'psa');assert.match(q('.case-assessment-register').textContent,/STP\/REVISED/);assert.match(q('.case-assessment-register').textContent,/Draft/);
    assert.equal(d.api.getRows().find((r:any)=>r.id==='saved-d').workflow.products.length,1);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test('assessment registers retain confirmed state on failed cell edits and combine PIC filters with PSA outcomes',async()=>{
  const d=await dashboard('supervisor',{casesTab:'pemeriksaan'});try{
    const row=d.api.getRows().find((r:any)=>r.id==='saved-d');
    await d.api.saveCaseWorkflow(row.id,{type:'close-examination',requestId:d.w.crypto.randomUUID(),number:'SPHP',date:'2026-10-30',assessments:[{kind:'SKP',number:'SKP/CONTROL',date:'2026-11-01',tax:'PPN',period:'2025',principal:1000,penalty:200,paymentTarget:'2026-11-05'}]});
    const id=row.workflow.products[0].id;
    await d.api.saveCaseWorkflow(row.id,{type:'psa-route',requestId:d.w.crypto.randomUUID(),productIds:[id]});
    await d.api.saveCaseWorkflow(row.id,{type:'psa-edit',requestId:d.w.crypto.randomUUID(),productId:id,requested:200,application:'PSA/LIVE',date:'2026-11-02',status:'Diajukan',note:''});
    await d.api.saveCaseWorkflow(row.id,{type:'psa-decision',requestId:d.w.crypto.randomUUID(),productId:id,number:'KEP/LIVE',date:'2026-11-04',outcome:'Disetujui sebagian',amount:100});
    d.api.state.casesTab='psa';d.api.state.expandedHimbauanId=row.id;d.api.state.caseWorkflowFilter='psa-successful';d.api.renderCases();
    assert.deepEqual(visible(d),['saved-d']);assert.match(d.w.document.querySelector('.case-assessment-summary').textContent,/1 successful/);assert.match(d.w.document.querySelector('.case-assessment-table').textContent,/KEP\/LIVE/);
    d.api.state.caseAccFilter='acc-b';d.api.renderCases();assert.deepEqual(visible(d),[]);d.api.state.caseAccFilter='all';d.api.state.caseWorkflowFilter='psa-ongoing';d.api.renderCases();assert.deepEqual(visible(d),[]);
    d.api.state.casesTab='register';d.api.state.caseWorkflowFilter='all';d.api.renderCases();assert.equal(d.w.document.querySelector('[data-ca-edit="principal"]').disabled,true,'submitted source references are protected');
    assert.equal(row.workflow.products[0].amount,1200);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test('manual removal integrates with retained timeline entries without offering deletion of automatic events',async()=>{
  const d=await dashboard();try{
    const row=d.api.getRows()[0],entry={id:'manual-note',entry:'Wrong case note',creatorProfileId:'tax-a',creatorName:'tax-a',createdAt:'2026-11-01T00:00:00Z'};
    d.api.state.expandedHimbauanId=row.id;d.api.state.caseProgressById[row.id]={progressEntries:[entry],completedTasks:[],taskTimeline:[],loadedAt:Date.now()};d.api.renderCases();
    const remove=d.w.document.querySelector('[data-ca-action="remove-progress"]');
    assert.ok(remove);
    assert.equal(remove.textContent.trim(),'','remove is icon-only');
    assert.equal(remove.getAttribute('aria-label'),'Remove incorrect update');
    assert.equal(remove.getAttribute('title'),'Remove incorrect update');
    assert.ok(remove.querySelector('svg[aria-hidden="true"]'));
    assert.equal(remove.parentElement.dataset.caseTimelineKey,'progress:manual-note','X belongs to the timeline card, not its text block');
    assert.ok(remove.parentElement.classList.contains('has-remove'));
    const style=d.w.getComputedStyle(remove);
    assert.equal(style.position,'absolute');assert.equal(style.top,'6px');assert.equal(style.right,'6px');
    assert.equal(style.color,'rgb(220, 38, 38)');
    assert.equal(d.w.getComputedStyle(remove.parentElement).paddingRight,'46px','reserve room for the corner action');
    remove.click();
    assert.ok(d.w.document.querySelector('#case-assessment-dialog [name="reason"]'),'icon retains the reason/confirmation dialog');
    assert.equal(d.writes.length,0,'opening the dialog does not remove a follow-up');
    d.w.document.querySelector('#case-assessment-dialog [data-ca-close]').click();
    row.workflow={result:null,products:[],schedule:[],payments:[],events:[],removedProgress:[{id:entry.id,entry:entry.entry,creatorId:'tax-a',reason:'Wrong client',at:'2026-11-05T00:00:00Z',actorId:'tax-a'}]};d.api.renderCases();
    assert.equal(d.w.document.querySelector('[data-case-timeline-key="progress:manual-note"]'),null);assert.match(d.w.document.querySelector('.case-removed-progress').textContent,/Wrong case note/);assert.equal(d.w.document.querySelector('[data-ca-action="restore-progress"]').textContent,'Restore');
    row.workflow.removedProgress[0].restoredAt='2026-11-05T01:00:00Z';d.api.renderCases();assert.ok(d.w.document.querySelector('[data-case-timeline-key="progress:manual-note"]'));assert.equal(d.w.document.querySelector('.case-removed-progress'),null);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test('inline assessment drafts require confirmed saves and another save cannot erase a neighbouring editor',async()=>{
  const d=await dashboard('supervisor',{casesTab:'pemeriksaan'});try{
    const row=d.api.getRows().find((r:any)=>r.id==='saved-d'),q=(s:string)=>d.w.document.querySelector(s);
    await d.api.saveCaseWorkflow(row.id,{type:'close-examination',requestId:d.w.crypto.randomUUID(),number:'SPHP',date:'2026-10-30'});
    d.api.state.casesTab='register';d.api.state.caseSearch='Delta';d.api.renderCases();assert.deepEqual(visible(d),['saved-d'],'an awaiting-documents control remains searchable');
    d.api.state.casesTab='pemeriksaan';d.api.state.caseSearch='';d.api.state.expandedHimbauanId=row.id;d.api.renderCases();q('[data-ca-action="add-SKP"]').click();assert.equal(q('#case-assessment-dialog'),null);
    assert.equal(d.w.CaseAssessmentUI.hasDrafts(),true);assert.equal(row.workflow.products.length,0);
    for(const [key,value]of Object.entries({number:'SKP/INLINE',period:'2025',date:'01/11/2026',principal:'1.000',penalty:'200'})){const input=q(`[data-ca-draft-field="${key}"]`);input.value=value;input.dispatchEvent(new d.w.Event('input',{bubbles:true}));}
    q('[data-ca-action="save-draft"]').click();await tick();assert.equal(row.workflow.products.length,1);assert.equal(d.w.CaseAssessmentUI.hasDrafts(),false);assert.equal(q('[data-ca-draft]'),null);
    q('[data-ca-action="add-STP"]').click();const draftId=q('[data-ca-draft]').dataset.caDraft;
    d.delay();const edit=q('[data-ca-edit="number"]');edit.value='SKP/UPDATED';edit.dispatchEvent(new d.w.Event('change',{bubbles:true}));await tick();
    const typing=q('[data-ca-draft-field="number"]');typing.focus();typing.value='STP still typing';typing.setSelectionRange(5,5);typing.dispatchEvent(new d.w.Event('input',{bubbles:true}));
    d.release();await tick();assert.equal(q('[data-ca-draft-field="number"]').value,'STP still typing');assert.equal(d.w.document.activeElement.dataset.caDraftField,'number');assert.equal(d.w.document.activeElement.selectionStart,5);
    q(`[data-ca-action="discard-draft"][data-ca-key="${draftId}"]`).click();assert.equal(d.w.CaseAssessmentUI.hasDrafts(),false);assert.equal(row.workflow.products.length,1);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

function prefetchControls(d:any) {
  let next=0;const timers=new Map<number,()=>any>();
  d.w.setTimeout=(fn:()=>any,ms:number)=>{if(ms!==300)return 0;timers.set(++next,fn);return next;};
  d.w.clearTimeout=(id:number)=>timers.delete(id);
  d.w.matchMedia=(query:string)=>({matches:query.includes('hover: hover'),addEventListener(){},removeEventListener(){}});
  const row=(id:string)=>d.w.document.querySelector(`[data-case-sheet-row="${id}"]`);
  const hover=(id:string)=>row(id).dispatchEvent(new d.w.MouseEvent('pointerover',{bubbles:true}));
  const leave=(id:string)=>row(id).dispatchEvent(new d.w.MouseEvent('pointerout',{bubbles:true}));
  const run=async()=>{const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)await fn();await tick();};
  return {row,hover,leave,run,timers};
}

test('assigned warmup selects last personally worked, newest and stale cases, caps at three, and excludes other PICs',async()=>{
  const d=await dashboard();try{
    const now=Date.now(),ago=(days:number)=>new Date(now-days*86400000).toISOString();
    const rows=d.api.getRows();
    Object.assign(rows[0],{createdAt:ago(90),version:ago(40),lastActivityAt:ago(40),myLastActivityAt:ago(1),activityAvailable:true});
    Object.assign(rows[1],{createdAt:ago(0),version:ago(0),lastActivityAt:ago(0),myLastActivityAt:ago(0),activityAvailable:true});
    Object.assign(rows[2],{createdAt:ago(0),version:ago(0),lastActivityAt:ago(0),myLastActivityAt:'',activityAvailable:true});
    Object.assign(rows[3],{createdAt:ago(120),version:ago(80),lastActivityAt:ago(80),myLastActivityAt:'',activityAvailable:true});
    assert.deepEqual(Array.from(d.api.assignedCasePreloadIds()),['saved-a','saved-c','saved-d']);
    d.api.resetAssignedPreload();const timers:Array<()=>any>=[];
    d.w.setTimeout=(fn:()=>any,ms:number)=>{if(ms===1500)timers.push(fn);return timers.length;};
    d.api.scheduleAssignedCasePreload();
    for(let i=0;i<4;i++){const fn=timers.shift();if(fn)await fn();await tick();}
    assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=')).length,3);
    assert.equal(d.reads.some((url:string)=>url.includes('progressFor=saved-b')),false);
    d.api.scheduleAssignedCasePreload();const last=timers.shift();if(last)await last();
    assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=')).length,3);
  }finally{d.dom.window.close();}
});

test('stale age uses WITA dates, excludes done and unknown records and resets on confirmed follow-up only',async()=>{
  const d=await dashboard();try{
    const item=d.api.getRows()[0],now=Date.UTC(2026,10,7,0),ago=(days:number)=>new Date(now-days*86400000).toISOString();
    Object.assign(item,{createdAt:ago(100),version:ago(61),lastActivityAt:ago(30),activityAvailable:true});
    assert.equal(d.api.caseInactivity(item,now),30);
    item.lastActivityAt=ago(60);assert.equal(d.api.caseInactivity(item,now),60);
    item.lastActivityAt='2026-11-06T15:59:59Z';assert.equal(d.api.caseInactivity(item,Date.parse('2026-11-06T16:00:00Z')),1);
    item.stage='Closed';assert.equal(d.api.caseInactivity(item,now),null);item.stage='In Progress';
    item.activityAvailable=false;assert.equal(d.api.caseInactivity(item,now),null);item.activityAvailable=true;
    const current=Date.now();item.version=new Date(current-70*86400000).toISOString();item.lastActivityAt=item.version;item.createdAt=item.version;
    d.api.refreshCaseActivityAppearance();assert.equal(d.w.document.querySelector('[data-case-sheet-row="saved-a"]').dataset.caseInactivity,'60');
    d.delay();const saving=d.api.addHimbauanProgress('saved-a','Verified activity');await tick();d.api.refreshCaseActivityAppearance();
    assert.equal(d.w.document.querySelector('[data-case-sheet-row="saved-a"]').dataset.caseInactivity,'60');
    d.release();await saving;assert.equal(d.w.document.querySelector('[data-case-sheet-row="saved-a"]').dataset.caseInactivity,'recent');
  }finally{d.dom.window.close();}
});

test('intent prefetch waits 300ms, cancels when leaving, and reuses the result without replacing the sheet',async()=>{
  const d=await dashboard();try{
    const c=prefetchControls(d),viewport=caseViewport(d);c.hover('saved-a');assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=')).length,0);
    c.leave('saved-a');await c.run();assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=')).length,0);
    c.hover('saved-a');await c.run();assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=saved-a')).length,1);assert.match(d.reads.at(-1) || '',/limit=10/);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=saved-a')).length,1);assert.equal(caseViewport(d),viewport);assert.deepEqual(d.writes,[]);
    const samples=d.w.casePerformanceSnapshot();assert.equal(samples[0].operation,'prefetch');assert.equal(typeof samples[0].requestMs,'number');assert.doesNotMatch(JSON.stringify(samples),/saved-a|Linked completed task|tax-a/);
  }finally{d.dom.window.close();}
});

test('only one speculative read runs and expanding its case shares the in-flight read',async()=>{
  const d=await dashboard();try{
    const c=prefetchControls(d),fetch=d.w.fetch;let release:any,reads=0;
    d.w.fetch=async(url:string,init:any)=>url.includes('progressFor=')?(reads++,await new Promise(resolve=>{release=resolve;})):fetch(url,init);
    c.hover('saved-a');const preload=c.run();await tick();assert.equal(reads,1);
    c.hover('saved-b');await c.run();assert.equal(reads,1);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();assert.equal(reads,1);assert.equal(d.w.document.getElementById('himbauan-progress-entry').disabled,false);
    release({ok:true,status:200,headers:new Headers({'Server-Timing':'auth;dur=12,data;dur=20'}),json:async()=>({progressEntries:[],completedTasks:[],taskTimeline:[]})});await preload;await tick();
    assert.deepEqual(JSON.parse(JSON.stringify(d.w.casePerformanceSnapshot()[0].server)),{auth:12,data:20});
  }finally{d.dom.window.close();}
});

test('preload skips constrained, hidden, offline and touch contexts while keyboard focus can preload',async()=>{
  const d=await dashboard();try{
    const c=prefetchControls(d);
    Object.defineProperty(d.w.navigator,'connection',{configurable:true,value:{saveData:true}});c.hover('saved-a');await c.run();
    d.w.navigator.connection.saveData=false;d.w.navigator.connection.effectiveType='2g';c.hover('saved-a');await c.run();
    d.w.navigator.connection.effectiveType='4g';Object.defineProperty(d.w.navigator,'onLine',{configurable:true,value:false});c.hover('saved-a');await c.run();
    Object.defineProperty(d.w.navigator,'onLine',{value:true});Object.defineProperty(d.w.document,'visibilityState',{configurable:true,value:'hidden'});c.hover('saved-a');await c.run();
    Object.defineProperty(d.w.document,'visibilityState',{value:'visible'});
    const touch=new d.w.MouseEvent('pointerover',{bubbles:true});Object.defineProperty(touch,'pointerType',{value:'touch'});c.row('saved-a').dispatchEvent(touch);await c.run();
    assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=')).length,0);
    c.row('saved-a').querySelector('button').focus();await c.run();assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=')).length,1);
  }finally{d.dom.window.close();}
});

test('timeline renders ten recent events and reveals cached older events without a new request',async()=>{
  const d=await dashboard();try{
    const fetch=d.w.fetch;
    d.w.fetch=async(url:string,init:any)=>url.includes('progressFor=')?{ok:true,status:200,json:async()=>({completedTasks:[],taskTimeline:[],progressEntries:Array.from({length:24},(_,index)=>({id:`entry-${index}`,entry:`Update ${index}`,createdAt:new Date(Date.UTC(2026,10,7,0,0,24-index)).toISOString()})),pageInfo:{hasMore:false}})}:fetch(url,init);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    assert.equal(d.w.document.querySelectorAll('[data-case-timeline-key]').length,10);assert.match(d.w.document.querySelector('[data-case-timeline]').textContent,/Update 0/);assert.doesNotMatch(d.w.document.querySelector('[data-case-timeline]').textContent,/Update 10/);
    d.w.document.querySelector('[data-case-load-older]').click();await tick();assert.equal(d.w.document.querySelectorAll('[data-case-timeline-key]').length,20);
    d.w.document.querySelector('[data-case-load-older]').click();await tick();assert.equal(d.w.document.querySelectorAll('[data-case-timeline-key]').length,24);assert.equal(d.w.document.querySelector('[data-case-load-older]'),null);
  }finally{d.dom.window.close();}
});

test('failed speculative loads are quiet and timing snapshots stay bounded, isolated and content-free',async()=>{
  const d=await dashboard();try{
    const c=prefetchControls(d),fetch=d.w.fetch;
    d.w.fetch=async(url:string,init:any)=>url.includes('progressFor=')?{ok:false,status:503,json:async()=>({error:'History temporarily unavailable'})}:fetch(url,init);
    c.hover('saved-a');await c.run();assert.doesNotMatch(d.w.document.getElementById('database-status-chip').textContent,/needs attention/);
    d.w.fetch=fetch;
    for(let i=0;i<32;i++)await d.api.loadCaseProgress('saved-a',{force:true});
    const samples=d.w.casePerformanceSnapshot();assert.equal(samples.length,30);samples[0].operation='modified';samples[0].server.auth=999;
    assert.notEqual(d.w.casePerformanceSnapshot()[0].operation,'modified');assert.equal(d.w.casePerformanceSnapshot()[0].server.auth,undefined);
    assert.doesNotMatch(JSON.stringify(d.w.casePerformanceSnapshot()),/saved-a|progressFor|tax-a|Linked completed task/);
  }finally{d.dom.window.close();}
});

test('follow-up save keeps editor nodes in place and retries unconfirmed text with the same request ID',async()=>{
  const d=await dashboard();try{
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    const input=d.w.document.getElementById('himbauan-progress-entry');input.value='Keep my text';input.focus();
    d.delay();const saving=d.api.addHimbauanProgress('saved-a','Keep my text');await tick();
    assert.equal(d.w.document.getElementById('himbauan-progress-entry'),input);assert.equal(d.w.document.activeElement,input);assert.equal(input.disabled,false);
    d.release();await saving;
    const fetch=d.w.fetch;let failed=true;const ids:string[]=[];
    d.w.fetch=async(url:string,init:any)=>{
      const body=init?.body?JSON.parse(init.body):{};
      if(body.action==='add-progress'){ids.push(body.entryId);if(failed){failed=false;throw new Error('Response lost');}}
      return fetch(url,init);
    };
    await assert.rejects(d.api.addHimbauanProgress('saved-a','Retry safely'),/Response lost/);
    await d.api.addHimbauanProgress('saved-a','Retry safely');assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.match(ids[0],/^[a-f0-9-]{36}$/);
  }finally{d.dom.window.close();}
});

test("sidebar hides points without stopping the background ledger or points calculation",async()=>{
  const d=await dashboard();try{
    assert.equal(d.w.document.querySelector('.sidebar .points-widget, #sidebar-points-total, #sidebar-points-rank'),null);
    const fetch=d.w.fetch;
    d.w.fetch=async(url:string,init:any)=>url==='/api/performance'?{ok:true,json:async()=>({data:[{period_key:'2026-05',points:12,staff_profile_id:'tax-a'}],publications:[]})}:fetch(url,init);
    await d.api.loadPerformanceLedger(true);
    assert.equal(d.api.state.performance.ledgerLoaded,true);assert.equal(d.api.state.performance.ledger[0].points,12);
    assert.match(html,/remainingLoads\.push\(\(\) => loadPerformanceLedger\(true\)\)/);
    assert.match(html,/loadPerformanceLedger\(true\);\s*\}, 120000\)/);
    assert.match(html,/function performanceLeaderboard\(/);assert.match(html,/Team Points/);
    assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("opening Cases details preserves the sheet and scroll, and recent reopens reuse cached history",async()=>{
  const d=await dashboard();try{
    const viewport=caseViewport(d),subject=field(d,'saved-a','subject'),head=d.w.document.querySelector('#cases-view thead');viewport.scrollLeft=500;
    const toggle=()=>d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();
    toggle();await tick();toggle();toggle();await tick();
    assert.equal(caseViewport(d),viewport);assert.equal(field(d,'saved-a','subject'),subject);assert.equal(d.w.document.querySelector('#cases-view thead'),head);assert.equal(viewport.scrollLeft,500);
    assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=saved-a')).length,1);
    d.api.state.caseProgressById['saved-a'].loadedAt=1;toggle();toggle();await tick();
    assert.equal(d.reads.filter((url:string)=>url.includes('progressFor=saved-a')).length,2);
  }finally{d.dom.window.close();}
});

test("unchanged background refreshes keep Cases table nodes and row identities without skipping later changes",async()=>{
  const d=await dashboard();try{
    const viewport=caseViewport(d),row=d.api.getRows()[0],cell=field(d,'saved-a','subject');viewport.scrollLeft=650;
    await d.api.loadSharedCases(true);await d.api.loadSharedCases(true);
    assert.equal(caseViewport(d),viewport);assert.equal(d.api.getRows()[0],row);assert.equal(field(d,'saved-a','subject'),cell);assert.equal(viewport.scrollLeft,650);
    d.rows[0].subject='Changed on the server';await d.api.loadSharedCases(true);
    assert.notEqual(caseViewport(d),viewport);assert.equal(field(d,'saved-a','subject').value,'Changed on the server');assert.equal(caseViewport(d).scrollLeft,650);
    assert.deepEqual(d.writes,[]);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("overlapping Cases reads share one request but an intervening write starts a fresh protected read",async()=>{
  const d=await dashboard();try{
    const fetch=d.w.fetch;const releases:Array<(response:any)=>void>=[];let reads=0;
    d.w.fetch=async(url:string,init:any)=>url==='/api/cases'&&!init?.method?(reads++,await new Promise(resolve=>releases.push(resolve))):fetch(url,init);
    const first=d.api.loadSharedCases(true),duplicate=d.api.loadSharedCases(true);await tick();assert.equal(reads,1);
    const old=structuredClone(d.rows),subject=field(d,'saved-a','subject');subject.value='New confirmed subject';await d.api.saveCaseSheetCell(subject);
    const fresh=d.api.loadSharedCases(true);await tick();assert.equal(reads,2);
    releases[1]({ok:true,json:async()=>({data:structuredClone(d.rows)})});await fresh;
    releases[0]({ok:true,json:async()=>({data:old})});await first;await duplicate;
    assert.equal(d.api.getRows().find((row:any)=>row.id==='saved-a').subject,'New confirmed subject');
    assert.equal(field(d,'saved-a','subject').value,'New confirmed subject');assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("malformed or failed Cases refreshes retain confirmed rows and the next refresh can retry",async()=>{
  const d=await dashboard();try{
    const fetch=d.w.fetch,viewport=caseViewport(d);const rows=d.api.getRows();
    d.w.fetch=async(url:string,init:any)=>url==='/api/cases'?{ok:true,json:async()=>({})}:fetch(url,init);
    assert.equal(await d.api.loadSharedCases(true),false);assert.equal(d.api.getRows(),rows);assert.equal(caseViewport(d),viewport);
    d.w.fetch=async(url:string,init:any)=>url==='/api/cases'?{ok:false,status:503}:fetch(url,init);
    assert.equal(await d.api.loadSharedCases(true),false);assert.equal(d.api.getRows(),rows);
    d.w.fetch=fetch;d.rows[0].subject='Retry succeeded';assert.equal(await d.api.loadSharedCases(true),true);assert.equal(field(d,'saved-a','subject').value,'Retry succeeded');
  }finally{d.dom.window.close();}
});

test("a refresh deferred while typing is rendered after editing even if the next server result is unchanged",async()=>{
  const d=await dashboard();try{
    const viewport=caseViewport(d),editor=field(d,'saved-a','subject');editor.focus();
    d.rows[1].subject='Another PIC updated this row';await d.api.loadSharedCases(true);
    assert.equal(caseViewport(d),viewport);assert.equal(d.w.document.activeElement,editor);assert.equal(field(d,'saved-b','subject').value,'Original');
    editor.blur();await tick();await d.api.loadSharedCases(true);
    assert.equal(field(d,'saved-b','subject').value,'Another PIC updated this row');assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("follow-ups remain editable during history reads and a late read cannot erase a confirmed save",async()=>{
  const d=await dashboard();try{
    const fetch=d.w.fetch;let release:any,reads=0;
    d.w.fetch=async(url:string,init:any)=>url.includes('progressFor=')?(reads++,await new Promise(resolve=>{release=resolve;})):fetch(url,init);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    assert.equal(d.w.document.getElementById('himbauan-progress-entry').disabled,false);
    const duplicate=d.api.loadCaseProgress('saved-a');assert.equal(reads,1);
    await d.api.addHimbauanProgress('saved-a','Confirmed while history loads');
    release({ok:true,status:200,json:async()=>({completedTasks:[],taskTimeline:[],progressEntries:[],pageInfo:{hasMore:false}})});await duplicate;await tick();
    assert.equal(d.api.state.caseProgressById['saved-a'].progressEntries[0].entry,'Confirmed while history loads');
    assert.match(d.w.document.querySelector('[data-case-followup-status]').textContent,/Saved to database/);
  }finally{d.dom.window.close();}
});

test("slow follow-up saves do not lock other rows, overwrite another draft or print unconfirmed work",async()=>{
  const d=await dashboard();try{
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    d.delay();const saving=d.api.addHimbauanProgress('saved-a','Update A');await tick();
    assert.equal(field(d,'saved-b','subject').disabled,false);
    assert.equal(d.w.document.querySelector('[data-add-himbauan-progress]').disabled,true);
    assert.doesNotMatch(d.w.document.querySelector('[data-case-followup-status]').textContent,/Saved/);
    const unload=new d.w.Event('beforeunload',{cancelable:true});d.w.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
    assert.equal(d.w.document.querySelector('[data-case-print-report]').disabled,true);
    const fullscreen=new d.w.MouseEvent('click',{bubbles:true,cancelable:true});d.w.document.querySelector('[data-case-fullscreen]').dispatchEvent(fullscreen);assert.equal(fullscreen.defaultPrevented,true);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-b"]').click();await tick();
    const input=d.w.document.getElementById('himbauan-progress-entry');input.value='Still typing B';input.dispatchEvent(new d.w.Event('input',{bubbles:true}));
    d.release();await saving;assert.equal(d.w.document.getElementById('himbauan-progress-entry').value,'Still typing B');
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();assert.equal(d.w.document.getElementById('himbauan-progress-entry').value,'');
    assert.equal(d.w.document.querySelector('[data-case-print-report]').disabled,false);
  }finally{d.dom.window.close();}
});

test("failed follow-ups retain their draft across collapse and navigation, without inventing saved history",async()=>{
  const d=await dashboard();try{
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();d.fail();
    const input=d.w.document.getElementById('himbauan-progress-entry');input.value='Do not lose this';input.dispatchEvent(new d.w.Event('input',{bubbles:true}));
    await assert.rejects(d.api.addHimbauanProgress('saved-a','Do not lose this'),/changed by another user/);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-b"]').click();await tick();
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    assert.equal(d.w.document.getElementById('himbauan-progress-entry').value,'Do not lose this');
    assert.match(d.w.document.querySelector('[data-case-followup-status]').textContent,/Save not confirmed/);
    assert.equal(d.api.state.caseProgressById['saved-a'].progressEntries.length,0);
  }finally{d.dom.window.close();}
});

test("older timeline pages append once, while permission loss discards cached history",async()=>{
  const d=await dashboard();try{
    const fetch=d.w.fetch;let page=0;
    d.w.fetch=async(url:string,init:any)=>url.includes('progressFor=')?{ok:true,status:200,json:async()=>({completedTasks:[],taskTimeline:[],progressEntries:page++?[{id:'note-1',entry:'Recent'},{id:'note-2',entry:'Older'}]:[{id:'note-1',entry:'Recent'}],pageInfo:{hasMore:page===1,cursor:{completedTasks:false,taskTimeline:false,progressEntries:{at:'2026-11-01T00:00:00Z',id:'00000000-0000-4000-8000-000000000001'}}}})}:fetch(url,init);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    d.w.document.querySelector('[data-case-load-older]').click();await tick();
    assert.equal(d.api.state.caseProgressById['saved-a'].progressEntries.length,2);assert.equal(d.w.document.querySelector('[data-case-load-older]'),null);
    d.w.fetch=async()=>({ok:false,status:403,json:async()=>({error:'No longer assigned'})});
    await d.api.loadCaseProgress('saved-a',{force:true});
    assert.equal(d.api.state.caseProgressById['saved-a'].progressEntries.length,0);
    assert.equal(d.w.document.getElementById('himbauan-progress-entry').disabled,true);
  }finally{d.dom.window.close();}
});

test("live Cases use concise copy and a neutral default without changing saved stages",async()=>{
  const d=await dashboard();try{
    d.rows[0].stage="Waiting Client Docs";await d.api.loadSharedCases(true);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    const panel=d.w.document.querySelector('.case-progress-inline');
    assert.match(panel.textContent,/In Progress/);assert.equal(d.api.getRows()[0].stage,"Waiting Client Docs");
    assert.doesNotMatch(panel.textContent,/Waiting Client Docs|Demo preview|separate workflow mockup|This concludes discussion|No duplicate follow-up|Follow-up log/);
    assert.equal((panel.textContent.match(/Case timeline/g)||[]).length,1);
    assert.match(panel.textContent,/Completed My Work \(1\)/);assert.match(panel.textContent,/20\/11\/2026/);
    d.w.document.querySelector('[data-cwf-action="record-result"]').click();
    const dialog=d.w.document.querySelector('#case-workflow-dialog');
    assert.doesNotMatch(dialog.textContent,/Saved only after database confirmation|Save to database/);
    assert.equal(dialog.querySelector('button[type="submit"]').textContent,"Save");
    const summary=d.w.CaseWorkflowUI.summary;
    assert.equal(summary({stage:"Document Review"}),"Document Review");
    assert.equal(summary({stage:"Closed"}),"Closed");
    assert.equal(summary({workflow:{final:{number:"SP3"}}}),"Closed");
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("case summary and printed report follow category, PIC and search scope without including drafts",async()=>{
  const d=await dashboard("staff");try{
    const count=(key:string)=>d.w.document.querySelector(`[data-case-report-metric="${key}"] strong`).textContent;
    const summary=d.w.document.querySelector('[data-case-report-slot]'),tools=d.w.document.querySelector('.case-sheet-tools');
    assert.ok(summary.compareDocumentPosition(tools)&d.w.Node.DOCUMENT_POSITION_FOLLOWING,"Summary precedes search and filters");
    assert.equal(count("handled"),"2");assert.equal(count("progress"),"2");
    let printed="",prints=0;
    d.w.open=()=>({opener:d.w,document:{open(){},write(value:string){printed=value;},close(){}},focus(){},print(){prints++;}});
    d.w.document.querySelector('[data-case-print-report]').click();await tick();assert.equal(prints,1);
    assert.match(printed,/Alpha|Gamma/);assert.doesNotMatch(printed,/>Beta</);assert.doesNotMatch(printed,/>Delta</);
    d.w.document.querySelector('#case-search').value="Alpha";d.w.document.querySelector('#case-search').dispatchEvent(new d.w.Event('input',{bubbles:true}));await tick();
    assert.equal(count("handled"),"1");d.w.document.querySelector('[data-case-print-report]').click();await tick();assert.match(printed,/Search: Alpha/);assert.doesNotMatch(printed,/>Gamma</);
    d.w.document.querySelector('[data-new-case]').click();
    assert.equal(d.w.document.querySelector('#case-search').value,"");
    assert.equal(count("handled"),"2","New Case resets filters, but its unsaved draft must not be counted");
    assert.equal(d.api.getRows().filter((row:any)=>row.id.startsWith('case-')).length,1);
    assert.equal(d.writes.length,0);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("printing fetches fresh progress for unopened rows with PIC and WITA time, not cached history",async()=>{
  const d=await dashboard();try{
    let printed="",prints=0;
    d.w.open=()=>({opener:d.w,document:{open(){},write(value:string){printed=value;},close(){}},focus(){},print(){prints++;},close(){}});
    d.api.state.caseProgressById['saved-a']={completedTasks:[],progressEntries:[{entry:"Stale cached follow-up",createdAt:"2026-10-01"}]};
    d.w.document.querySelector('[data-case-print-report]').click();await tick();
    assert.equal(prints,1);assert.ok(d.reads.includes('/api/cases/report'));
    assert.match(printed,/Latest saved PIC follow-up/);assert.doesNotMatch(printed,/Stale cached follow-up/);
    assert.match(printed,/Last update: 05\/11\/2026, 15:00 WITA \/ tax-a/);
    assert.match(printed,/Latest Progress \/ Last Update/);assert.equal(d.writes.length,0);
    assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});
test("a failed progress read never prints a partial report or substitutes cached progress",async()=>{
  const d=await dashboard();try{
    let prints=0,closes=0;
    d.w.open=()=>({closed:false,opener:d.w,document:{open(){},write(){},close(){}},focus(){},print(){prints++;},close(){closes++;this.closed=true;}});
    const fetch=d.w.fetch;
    d.w.fetch=(url:string,init:any)=>url==='/api/cases/report'?Promise.resolve({ok:false,status:500,json:async()=>({error:'Progress unavailable'})}):fetch(url,init);
    d.w.document.querySelector('[data-case-print-report]').click();await tick();
    assert.equal(prints,0);assert.equal(closes,1);assert.match(d.w.document.querySelector('#cases-view').textContent,/Report not printed: Progress unavailable/);
    assert.equal(d.w.document.querySelector('[data-case-print-report]').disabled,false);assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});
test("summary waits for confirmed workflow changes and blocks printing during queued saves",async()=>{
  const d=await dashboard();try{
    const before=field(d,"saved-b","subject");before.value="Still typing";
    d.delay();const save=d.api.saveCaseWorkflow("saved-a",workflowResult());await tick();
    assert.equal(d.w.document.querySelector('[data-case-print-report]').disabled,true);
    assert.equal(d.w.document.querySelector('[data-case-report-metric="payment"] strong').textContent,"0");
    d.release();await save;
    assert.equal(d.w.document.querySelector('[data-case-report-metric="payment"] strong').textContent,"1");
    assert.equal(d.w.document.querySelector('[data-case-report-metric="handled"] strong').textContent,"3");
    assert.equal(d.w.document.querySelector('[data-case-print-report]').disabled,false);
    assert.equal(field(d,"saved-b","subject"),before);assert.equal(before.value,"Still typing");
    d.w.open=()=>null;d.w.document.querySelector('[data-case-print-report]').click();assert.match(d.w.document.querySelector('#cases-view').textContent,/Allow pop-ups to print/);
    assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});

test("workflow is embedded without replacing sheet cells, saved widths, scroll or full-screen link",async()=>{
  const d=await dashboard();try{
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    assert.equal(d.w.document.querySelectorAll('[data-cwf-tab]').length,3);
    const subject=field(d,"saved-b","subject"),viewport=caseViewport(d),column=d.w.document.querySelector('col[data-case-column="clientName"]');
    column.style.width="345px";viewport.scrollLeft=420;subject.value="Still typing";subject.focus();
    d.delay();const save=d.api.saveCaseWorkflow("saved-a",workflowResult());await tick();
    assert.equal(d.api.getRows()[0].workflow,null,"not published before confirmation");
    assert.equal(d.w.document.querySelector('[data-case-timeline-key="workflow:43047f51-f5a0-413c-9c86-47ef60302a43"]'),null);
    d.release();await save;
    assert.equal(field(d,"saved-b","subject"),subject);assert.equal(subject.value,"Still typing");
    assert.equal(viewport.scrollLeft,420);assert.equal(column.style.width,"345px");assert.ok(d.w.document.querySelector('[data-case-fullscreen]'));
    assert.match(d.w.document.querySelector('.case-progress-inline').textContent,/BA-INTEGRATION/);
    d.w.document.querySelector('[data-cwf-tab="payments"]').click();assert.match(d.w.document.querySelector('.case-progress-inline').textContent,/Rp1\.000/);
    d.w.document.querySelector('[data-cwf-tab="tax"]').click();assert.equal(d.w.document.querySelector('[data-cwf-action="record-filing"]').disabled,true);
    assert.equal(d.w.document.querySelector('[data-cwf-action="record-final"]').disabled,true);
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    const cached=JSON.parse(d.w.localStorage.getItem('tax-practice-v2:auth-user-1'));
    assert.deepEqual(cached.collections.taxCases,[],"Live BA/payment records are not a browser cache");
    assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});
test("workflow failure retains confirmed state; cell and workflow writes share a per-case queue",async()=>{
  const d=await dashboard();try{
    d.delay();const save=d.api.saveCaseWorkflow("saved-a",workflowResult());await tick();
    const subject=field(d,"saved-a","subject");subject.value="After BA";const edit=d.api.saveCaseSheetCell(subject);
    assert.equal(d.writes.length,1);d.release();await save;await edit;
    assert.equal(d.writes[1].version,"v2");assert.equal(d.api.getRows()[0].subject,"After BA");assert.equal(d.api.getRows()[0].workflow.result.number,"BA-INTEGRATION");
    d.fail();await assert.rejects(d.api.saveCaseWorkflow("saved-a",{type:"record-response",requestId:d.w.crypto.randomUUID()}));
    assert.equal(d.api.getRows()[0].workflow.events.length,1);
  }finally{d.dom.window.close();}
});
test("task snapshots merge once with follow-ups and retain completion after reopening",async()=>{
  const d=await dashboard();try{
    const item=d.api.getRows()[0];
    const events=d.api.caseTimeline(item,{completedTasks:[{id:"task-1",title:"Changed title",completedAt:"2026-11-02"}],taskTimeline:[{id:"event-1",task_id:"task-1",title:"Original completed work",actor_name:"tax-a",event_type:"completed",occurred_at:"2026-11-02"},{id:"event-2",task_id:"task-1",title:"Original completed work",actor_name:"My Work",event_type:"reopened",occurred_at:"2026-11-03"}],progressEntries:[{id:"note-1",entry:"Client confirmed",createdAt:"2026-11-01"}]});
    assert.equal(events.length,3);assert.match(events[0].entry,/Reopened/);assert.match(events[1].entry,/Original completed work/);assert.equal(events.some((e:any)=>e.entry==="Changed title"),false);
  }finally{d.dom.window.close();}
});
test("workflow dialog preserves invalid entries on failure and closes only after confirmed save",async()=>{
  const d=await dashboard();try{
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click();await tick();
    d.w.document.querySelector('[data-cwf-action="record-result"]').click();
    const dialog=d.w.document.querySelector('#case-workflow-dialog');assert.ok(dialog.hasAttribute('open'));
    dialog.querySelector('[name="number"]').value="BA-DIALOG";dialog.querySelector('[name="date"]').value="01/11/2026";dialog.querySelector('[name="text"]').value="Agreed";
    const choice=dialog.querySelector('[data-cwf-product="0"]');choice.checked=true;choice.dispatchEvent(new d.w.Event('change',{bubbles:true}));
    dialog.querySelector('[name="period-0"]').value="2025";dialog.querySelector('[name="amount-0"]').value="-1000";
    const submit=()=>dialog.querySelector('form').dispatchEvent(new d.w.Event('submit',{bubbles:true,cancelable:true}));
    submit();await tick();assert.match(dialog.querySelector('[data-cwf-error]').textContent,/whole rupiah/);assert.equal(d.writes.length,0);assert.equal(dialog.querySelector('[name="number"]').value,"BA-DIALOG");
    dialog.querySelector('[name="amount-0"]').value="1.000";dialog.querySelector('[name="paymentTarget"]').value="05/11/2026";dialog.querySelector('[name="revisionTarget"]').value="06/11/2026";
    d.delay();submit();await tick();assert.equal(dialog.querySelector('button[type="submit"]').disabled,true);assert.ok(dialog.isConnected);
    d.release();await tick();await tick();assert.equal(dialog.isConnected,false);assert.equal(d.api.getRows()[0].workflow.products[0].amount,1000);
    assert.deepEqual(d.warnings,[]);
  }finally{d.dom.window.close();}
});
function mockCaseViewportGeometry(d: any) {
  for (const [property, value] of Object.entries({ scrollWidth:2400, clientWidth:900, scrollHeight:1400, clientHeight:500 })) {
    Object.defineProperty(d.w.HTMLElement.prototype, property, { configurable:true, get() { return (this as any).getAttribute("data-virtual-table") === "cases" ? value : 0; } });
  }
}

test("Cases retain horizontal scroll on refreshes and direct renders without losing existing vertical restoration", async () => {
  for (const casesTab of ["himbauan", "pemeriksaan"]) for (const query of ["", "?casesFullscreen=1&account=auth-user-1"]) {
    const d = await dashboard("supervisor", { casesTab }, false, query);
    try {
      mockCaseViewportGeometry(d);
      const initial = caseViewport(d); initial.scrollLeft = 720; initial.scrollTop = 180;
      const rowId = casesTab === "himbauan" ? "saved-a" : "saved-d";
      d.rows.find((row: any) => row.id === rowId)!.subject = "Confirmed background change";
      await d.api.loadSharedCases(true);
      assert.notEqual(caseViewport(d), initial, "exercise actual table replacement, not a disabled refresh");
      assert.equal(caseViewport(d).scrollLeft, 720); assert.equal(caseViewport(d).scrollTop, 180);
      assert.equal(field(d, rowId, "subject").value, "Confirmed background change");
      await d.api.loadStaffDirectory(true);
      assert.equal(caseViewport(d).scrollLeft, 720); assert.equal(caseViewport(d).scrollTop, 180);
      caseViewport(d).scrollLeft = 1100; caseViewport(d).scrollTop = 240;
      d.api.renderCases();
      assert.equal(caseViewport(d).scrollLeft, 1100);
      assert.deepEqual(d.writes, []); assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("a delayed Cases refresh retains the user's latest scroll position, not where the request started", async () => {
  const d = await dashboard();
  try {
    mockCaseViewportGeometry(d);
    let release!: () => void;
    const fetch = d.w.fetch;
    d.w.fetch = async (url: string, init: any) => {
      const response = await fetch(url, init);
      if (url === "/api/cases") await new Promise<void>(resolve => { release = resolve; });
      return response;
    };
    caseViewport(d).scrollLeft = 200;
    const refreshing = d.api.loadSharedCases(true); await tick();
    caseViewport(d).scrollLeft = 1200; caseViewport(d).scrollTop = 350;
    release(); await refreshing;
    assert.equal(caseViewport(d).scrollLeft, 1200); assert.equal(caseViewport(d).scrollTop, 350);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click(); await tick();
    assert.equal(caseViewport(d).scrollLeft, 1200);
    const viewport = caseViewport(d);
    await d.api.loadCaseProgress("saved-a");
    assert.equal(caseViewport(d), viewport); assert.equal(viewport.scrollLeft, 1200);
    assert.deepEqual(d.writes, []); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

const copyRange = (d: any, td: any) => {
  let copied = ""; const event = new d.w.Event("copy", { bubbles:true, cancelable:true });
  Object.defineProperty(event, "clipboardData", { value:{ setData: (_type: string, value: string) => { copied = value; } } });
  td.dispatchEvent(event); assert.equal(event.defaultPrevented, true); return copied;
};

test("case creation refreshes the inbox and distinguishes notification problems from failed case saves", async () => {
  for (const status of ["delivered", "queued", "failed"]) {
    const d = await dashboard();
    try {
      d.announcementStatus(status);
      const reads = d.reads.filter(url => url === "/api/announcements").length;
      d.w.document.querySelector("[data-new-case]").click();
      const draft = d.api.getRows().find((item: any) => item.id.startsWith("case-"));
      const client = field(d, draft.id, "clientName"); client.value = "Alpha";
      await d.api.saveCaseSheetCell(client); await tick();
      assert.equal(d.writes.length, 1); assert.equal(draft.id.startsWith("case-"), false);
      assert.equal(d.reads.filter(url => url === "/api/announcements").length, reads + 1);
      const message = d.w.document.getElementById("case-sheet-status").textContent;
      assert.match(message, status === "failed" ? /Case saved.*delivery could not be confirmed/ : status === "queued" ? /Case saved.*queued/ : /Saved to database/);
      assert.doesNotMatch(message, /^Not saved/);
      assert.equal(d.api.state.announcements.length, status === "delivered" ? 1 : 0);
      assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("bulk new cases refresh announcements once after the batch, not once per row", async () => {
  const d = await dashboard();
  try {
    const reads = d.reads.filter(url => url === "/api/announcements").length;
    d.w.document.querySelector("[data-new-case]").click();
    const draft = d.api.getRows().find((item: any) => item.id.startsWith("case-"));
    await d.api.pasteCaseSheetRange(gridCell(d, draft.id, "clientName"), "Alpha\tNEW-1\nAlpha\tNEW-2"); await tick();
    assert.equal(d.writes.length, 2);
    assert.equal(d.reads.filter(url => url === "/api/announcements").length, reads + 1);
    assert.equal(d.api.state.announcements.length, 2); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("opening the desktop inbox fetches current announcements and an open Alerts page refreshes its content", async () => {
  const d = await dashboard();
  try {
    const item = (id: string) => ({ id, title:`New case ${id}`, message:"Test update", audience:"all", sender:"PIC", createdAt:"2026-11-02T00:00:00Z", readAt:null });
    d.announcements.push(item("one"));
    d.w.document.querySelector("[data-open-announcement-inbox]").click(); await tick();
    assert.match(d.w.document.getElementById("announcement-inbox-root").textContent, /New case one/);
    d.w.document.querySelector('[data-view="announcement-view"]').click(); await tick();
    d.announcements.push(item("two"));
    await d.api.loadSharedAnnouncements(true);
    assert.match(d.w.document.getElementById("announcement-view").textContent, /New case two/);
    assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("an older announcement read cannot replace a newer inbox response", async () => {
  const d = await dashboard();
  try {
    let release!: () => void, calls = 0;
    const fetch = d.w.fetch;
    d.w.fetch = async (url: string, init: any) => {
      if (url !== "/api/announcements") return fetch(url, init);
      const first = ++calls === 1;
      if (first) await new Promise<void>(resolve => { release = resolve; });
      return { ok:true, json:async () => ({ announcements:[{ id:first ? "older" : "latest", title:"Update", audience:"all" }] }) };
    };
    const oldRead = d.api.loadSharedAnnouncements(true); await tick();
    await d.api.loadSharedAnnouncements(true); release(); await oldRead;
    assert.equal(d.api.state.announcements[0].id, "latest"); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("Notification Center dismisses outside, by Close or Escape, without changing workspace data", async () => {
  const d = await dashboard();
  try {
    const trigger = d.w.document.querySelector("[data-open-announcement-inbox]");
    const root = d.w.document.getElementById("announcement-inbox-root");
    assert.equal(trigger.querySelector(".topbar-desktop-label").textContent, "Notification");
    for (const method of ["outside", "close", "escape", "toggle"]) {
      trigger.click(); await tick();
      assert.equal(trigger.getAttribute("aria-expanded"), "true");
      const panel = root.querySelector(".announcement-inbox");
      assert.equal(panel.getAttribute("aria-label"), "Notification Center");
      panel.querySelector("strong").click();
      assert.equal(d.api.state.announcementInboxOpen, true, "inside clicks must not dismiss the popup");
      if (method === "outside") root.querySelector(".announcement-inbox-backdrop").click();
      else if (method === "close") panel.querySelector("[data-close-announcement-inbox]").click();
      else if (method === "escape") d.w.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
      else trigger.click();
      assert.equal(d.api.state.announcementInboxOpen, false);
      assert.equal(root.children.length, 0);
      assert.equal(trigger.getAttribute("aria-expanded"), "false");
      assert.equal(d.api.state.currentView, "cases-view");
    }
    assert.deepEqual(d.writes, []); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("Notification Center read and History actions remain functional inside its dismissal backdrop", async () => {
  const d = await dashboard();
  try {
    d.announcements.push({ id:"notice-1", title:"New case", message:"Assigned to you", audience:"all", sender:"PIC", createdAt:"2026-11-03T00:00:00Z", readAt:null });
    const trigger = d.w.document.querySelector("[data-open-announcement-inbox]");
    trigger.click(); await tick();
    d.w.document.querySelector("[data-read-announcement] strong").click(); await tick();
    assert.equal(d.api.state.announcementInboxOpen, true, "reading a notification must not dismiss the panel");
    assert.ok(d.api.state.announcements[0].readAt);
    assert.equal(d.writes.length, 1); assert.equal(d.writes[0].announcementId, "notice-1");
    d.w.document.querySelector("[data-open-announcement-history]").click(); await tick();
    assert.equal(d.api.state.announcementInboxOpen, false);
    assert.equal(d.api.state.currentView, "profile-view"); assert.equal(d.api.state.profileTab, "history");
    assert.match(d.w.document.getElementById("profile-view").textContent, /Notification History/);
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("Cases default to creation order and retain earlier numbers through name sorts, filters, saves and reloads", async () => {
  const d = await dashboard("supervisor", { caseSheetSort:{ key:"clientName", direction:"asc" } });
  try {
    d.rows[0].client_name = "Zulu"; d.rows[1].client_name = "Alpha"; d.rows[2].client_name = "Middle";
    await d.api.loadSharedCases(); d.api.renderCases();
    const numbers = () => Object.fromEntries([...d.w.document.querySelectorAll("[data-case-sheet-row]")].map((row: any) => [row.dataset.caseSheetRow, row.querySelector(".case-sheet-row-toggle > span").textContent]));
    assert.equal(d.api.state.caseSheetSort.key, "createdAt");
    assert.deepEqual(visible(d), ["saved-a", "saved-b", "saved-c"]);
    assert.deepEqual(numbers(), { "saved-a":"1", "saved-b":"2", "saved-c":"3" });
    d.w.document.querySelector('[data-case-sheet-sort="clientName"]').click();
    assert.deepEqual(visible(d), ["saved-b", "saved-c", "saved-a"]);
    assert.deepEqual(numbers(), { "saved-b":"2", "saved-c":"3", "saved-a":"1" });
    const filter = d.w.document.getElementById("case-tax-filter"); filter.value = "tax-a"; filter.dispatchEvent(new d.w.Event("change", { bubbles:true }));
    assert.deepEqual(numbers(), { "saved-c":"3", "saved-a":"1" });
    d.w.document.querySelector("[data-case-sheet-reset]").click();
    const cell = field(d, "saved-a", "subject"); cell.value = "Latest update"; await d.api.saveCaseSheetCell(cell);
    await d.api.loadSharedCases(); d.api.renderCases();
    assert.deepEqual(visible(d), ["saved-a", "saved-b", "saved-c"]);
    assert.deepEqual(numbers(), { "saved-a":"1", "saved-b":"2", "saved-c":"3" });
    d.w.document.querySelector("[data-new-case]").click();
    const draft = d.api.getRows().find((row: any) => row.id.startsWith("case-"));
    assert.equal(visible(d).at(-1), draft.id);
    assert.equal(numbers()[draft.id], "4");
    assert.equal(JSON.parse(d.w.localStorage.getItem("tax-practice-v2:auth-user-1")).ui.caseSheetSortVersion, 2);
  } finally { d.dom.window.close(); }
});

test("range selection supports drag, Shift+click, keyboard extension and day-first Excel copying", async () => {
  const d = await dashboard("supervisor", {}, false, "?casesFullscreen=1&account=auth-user-1");
  try {
    d.rows[0].letter_date = "2026-11-05"; d.rows[1].letter_date = "2026-11-06";
    await d.api.loadSharedCases(); d.api.renderCases();
    const start = gridCell(d, "saved-a", "letterNumber"), end = gridCell(d, "saved-b", "letterDate");
    start.dispatchEvent(new d.w.MouseEvent("pointerdown", { button:0, bubbles:true }));
    end.dispatchEvent(new d.w.MouseEvent("pointermove", { bubbles:true, cancelable:true }));
    end.dispatchEvent(new d.w.MouseEvent("pointerup", { bubbles:true }));
    assert.equal(d.w.document.querySelectorAll('[aria-selected="true"]').length, 4);
    assert.equal(copyRange(d, start), "saved-a\t05/11/2026\r\nsaved-b\t06/11/2026");
    d.api.clearCaseSheetRange();
    start.dispatchEvent(new d.w.MouseEvent("pointerdown", { button:0, bubbles:true }));
    start.dispatchEvent(new d.w.MouseEvent("pointerup", { bubbles:true }));
    end.dispatchEvent(new d.w.MouseEvent("pointerdown", { button:0, shiftKey:true, bubbles:true }));
    assert.equal(d.w.document.querySelectorAll('[aria-selected="true"]').length, 4);
    d.api.clearCaseSheetRange();
    field(d, "saved-a", "letterNumber").focus();
    field(d, "saved-a", "letterNumber").dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"ArrowRight", shiftKey:true, bubbles:true, cancelable:true }));
    assert.equal(copyRange(d, start), "saved-a\t05/11/2026");
    assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("explicit column sort preferences survive reload while No. restores creation order", async () => {
  const d = await dashboard("supervisor", { caseSheetSortVersion:2, caseSheetSort:{ key:"clientName", direction:"desc" } });
  try {
    assert.deepEqual(visible(d), ["saved-c", "saved-b", "saved-a"]);
    d.w.document.querySelector('[data-case-sheet-sort="createdAt"]').click();
    assert.deepEqual(visible(d), ["saved-a", "saved-b", "saved-c"]);
    d.w.document.querySelector('[data-case-sheet-sort="createdAt"]').click();
    assert.deepEqual(visible(d), ["saved-c", "saved-b", "saved-a"]);
    assert.deepEqual([...d.w.document.querySelectorAll(".case-sheet-row-toggle > span:first-child")].map((span: any) => span.textContent), ["3", "2", "1"]);
  } finally { d.dom.window.close(); }
});

test("bulk paste saves date rectangles as one version-checked ordinary-field update per row", async () => {
  for (const tab of ["himbauan", "pemeriksaan"]) {
    const d = await dashboard("supervisor", {}, false, "?casesFullscreen=1&account=auth-user-1");
    try {
      if (tab === "pemeriksaan") { d.rows[0].case_category = "Pemeriksaan"; d.rows[1].case_category = "Pemeriksaan"; await d.api.loadSharedCases(); }
      d.w.document.querySelector(`[data-cases-tab="${tab}"]`).click();
      await d.api.pasteCaseSheetRange(gridCell(d, "saved-a", "letterDate"), "05/11/2026\t06/11/2026\r\n2026-12-04\t5/12/2026\r\n");
      assert.equal(d.writes.length, 2);
      assert.deepEqual(d.writes.map((write: any) => [write.id, write.case.letterDate, write.case.receivedDate, write.version]), [
        ["saved-a", "2026-11-05", "2026-11-06", "v1"], ["saved-b", "2026-12-04", "2026-12-05", "v1"]
      ]);
      assert.equal(field(d, "saved-a", "letterDate").value, "05/11/2026");
      assert.equal(field(d, "saved-b", "receivedDate").value, "05/12/2026");
      assert.match(d.w.document.getElementById("case-sheet-status").textContent, /2 row\(s\) saved/);
      assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("bulk validation rejects the entire range before any save if a date, shape or protected field is invalid", async () => {
  const d = await dashboard();
  try {
    const dates = gridCell(d, "saved-a", "letterDate");
    for (const source of ["05/11/2026\t06/11/2026\n31/02/2026\t07/11/2026", '"unfinished', "one\ttwo\nthree", Array(251).fill("05/11/2026").join("\n")]) {
      await d.api.pasteCaseSheetRange(dates, source);
      assert.equal(d.writes.length, 0); assert.equal(field(d, "saved-a", "letterDate").value, "");
      assert.match(d.w.document.getElementById("case-sheet-status").textContent, /Nothing was pasted/);
    }
    await d.api.pasteCaseSheetRange(gridCell(d, "saved-a", "clientName"), "Another client\tnew letter");
    assert.equal(d.writes.length, 0);
    await d.api.pasteCaseSheetRange(gridCell(d, "saved-a", "subject"), "New subject\t01/01/2027");
    assert.equal(d.writes.length, 0); assert.equal(field(d, "saved-a", "subject").value, "Original");
    await d.api.pasteCaseSheetRange(gridCell(d, "saved-a", "notes"), "One\tToo many");
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("scalar range fill and quoted multiline Excel cells preserve dates, text and copy round trips", async () => {
  const d = await dashboard();
  try {
    const start = gridCell(d, "saved-a", "letterDate"), end = gridCell(d, "saved-b", "receivedDate");
    d.api.selectCaseSheetRange(start); d.api.selectCaseSheetRange(end, true);
    await d.api.pasteCaseSheetRange(start, "5/11/2026");
    assert.equal(d.writes.length, 2);
    assert.equal(field(d, "saved-b", "receivedDate").value, "05/11/2026");
    d.api.clearCaseSheetRange();
    const note = gridCell(d, "saved-a", "notes");
    await d.api.pasteCaseSheetRange(note, '"Line one\nLine ""two""\twith tab"');
    assert.equal(d.writes.at(-1).case.notes, 'Line one\nLine "two"\twith tab');
    d.api.selectCaseSheetRange(note);
    assert.equal(copyRange(d, note), '"Line one\nLine ""two""\twith tab"');
    const before = d.writes.length;
    await d.api.pasteCaseSheetRange(note, copyRange(d, note));
    assert.equal(d.writes.length, before);
  } finally { d.dom.window.close(); }
});

test("bulk saves retain only confirmed data, bound concurrency and report row conflicts without hiding successful writes", async () => {
  const d = await dashboard();
  try {
    d.delay();
    const saving = d.api.pasteCaseSheetRange(gridCell(d, "saved-a", "letterDate"), "05/11/2026\t06/11/2026"); await tick();
    assert.ok(d.w.document.querySelector(".case-sheet").hasAttribute("inert"));
    const leaving = new d.w.Event("beforeunload", { cancelable:true }); d.w.dispatchEvent(leaving); assert.equal(leaving.defaultPrevented, true);
    await d.api.saveCaseSheetCell(field(d, "saved-b", "subject")); assert.equal(d.writes.length, 1);
    const record = d.api.getRows().find((row: any) => row.id === "saved-a");
    assert.equal(record.letterDate, ""); assert.equal(record.receivedDate, "");
    assert.equal(field(d, "saved-a", "letterDate").value, "05/11/2026");
    const reads = d.reads.length; await d.api.loadSharedCases(true); assert.equal(d.reads.length, reads);
    d.release(); await saving; assert.equal(record.letterDate, "2026-11-05");
    assert.equal(d.w.document.querySelector(".case-sheet").hasAttribute("inert"), false);
    d.failCase("saved-b");
    await d.api.pasteCaseSheetRange(gridCell(d, "saved-a", "letterDate"), "07/11/2026\n08/11/2026");
    assert.equal(record.letterDate, "2026-11-07"); assert.equal(field(d, "saved-b", "letterDate").value, "");
    assert.match(d.w.document.getElementById("case-sheet-status").textContent, /1 row\(s\) saved; 1 incomplete: Beta/);
  } finally { d.dom.window.close(); }
});

test("leadership bulk PIC paste resolves directory names while staff cannot overwrite ownership", async () => {
  for (const role of ["supervisor", "staff"]) {
    const d = await dashboard(role);
    try {
      await d.api.pasteCaseSheetRange(gridCell(d, "saved-a", "taxPicProfileId"), "tax-b\tacc-b");
      if (role === "staff") { assert.equal(d.writes.length, 0); assert.match(d.w.document.getElementById("case-sheet-status").textContent, /leadership/); }
      else { assert.equal(d.writes.length, 2); assert.equal(d.writes[0].action, "assign-pic"); assert.equal(d.writes[1].version, "v2"); assert.equal(d.api.getRows()[0].accountingPicProfileId, "acc-b"); }
    } finally { d.dom.window.close(); }
  }
});

test("bulk creation appends valid Client Master rows and preserves combined dates and text through server identity replacement", async () => {
  const d = await dashboard();
  try {
    d.w.document.querySelector("[data-new-case]").click();
    const draft = d.api.getRows().find((row: any) => row.id.startsWith("case-"));
    const start = gridCell(d, draft.id, "clientName");
    d.delay();
    const saving = d.api.pasteCaseSheetRange(start, "Alpha\t111\t05/11/2026\t06/11/2026\tFirst\nAlpha\t222\t07/11/2026\t08/11/2026\tSecond"); await tick();
    assert.equal(d.writes.length, 1, "new cases are created in paste order, not concurrently");
    d.release(); await saving;
    assert.equal(d.writes.length, 2);
    assert.ok(d.writes.every((write: any) => !write.id && write.case.clientId === "master-1"));
    assert.equal(field(d, "saved-new", "letterDate").value, "05/11/2026");
    assert.equal(field(d, "saved-new-2", "subject").value, "Second");
    assert.equal(d.api.getRows().filter((row: any) => row.id.startsWith("case-")).length, 0);
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("bulk paste uses no more than two concurrent case writes and copy/paste of an unchanged complete row is a no-op", async () => {
  const d = await dashboard();
  try {
    const fetch = d.w.fetch; let active = 0, maximum = 0;
    d.w.fetch = async (url: string, init: any = {}) => {
      if (!init.method || init.method === "GET") return fetch(url, init);
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setImmediate(resolve));
      try { return await fetch(url, init); } finally { active--; }
    };
    await d.api.pasteCaseSheetRange(gridCell(d, "saved-a", "letterDate"), "05/11/2026\n06/11/2026\n07/11/2026");
    assert.equal(maximum, 2); assert.equal(d.writes.length, 3);
    const start = gridCell(d, "saved-a", "clientName"), end = gridCell(d, "saved-a", "notes");
    d.api.selectCaseSheetRange(start); d.api.selectCaseSheetRange(end, true);
    const copied = copyRange(d, start), before = d.writes.length;
    await d.api.pasteCaseSheetRange(start, copied);
    assert.equal(d.writes.length, before);
    assert.match(d.w.document.getElementById("case-sheet-status").textContent, /already match/);
  } finally { d.dom.window.close(); }
});

test("case date paste converts day-first dates and saves ISO values in both sheets and layouts", async () => {
  for (const query of ["", "?casesFullscreen=1&account=auth-user-1"]) {
    const d = await dashboard("supervisor", {}, false, query);
    try {
      for (const [tab, id, name, source, expected] of [
        ["himbauan", "saved-a", "letterDate", "05/11/2026", "2026-11-05"],
        ["himbauan", "saved-a", "receivedDate", " 6/11/2026\r\n", "2026-11-06"],
        ["himbauan", "saved-a", "completionDate", "29/02/2028", "2028-02-29"],
        ["pemeriksaan", "saved-d", "letterDate", "2026-12-31", "2026-12-31"],
        ["pemeriksaan", "saved-d", "receivedDate", "04/03/2026", "2026-03-04"],
        ["pemeriksaan", "saved-d", "sphpDate", "31/12/2026", "2026-12-31"]
      ]) {
        d.w.document.querySelector(`[data-cases-tab="${tab}"]`).click();
        const cell = field(d, id, name), before = d.writes.length;
        const display = expected.split("-").reverse().join("/");
        assert.equal(cell.type, "text"); assert.equal(cell.placeholder, "dd/mm/yyyy");
        const event = new d.w.Event("paste", { bubbles:true, cancelable:true });
        Object.defineProperty(event, "clipboardData", { value:{ getData: () => source } });
        cell.dispatchEvent(event);
        assert.equal(event.defaultPrevented, true); assert.equal(cell.value, display);
        assert.equal(d.writes.length, before);
        cell.dispatchEvent(new d.w.FocusEvent("focusout", { bubbles:true })); await tick();
        assert.equal(d.writes.length, before + 1);
        assert.equal(d.writes.at(-1).case[name], expected);
        assert.equal(field(d, id, name).value, display);
        assert.equal(d.api.getRows().find((row: any) => row.id === id)[name], expected);
      }
      assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("invalid, multi-cell and locked date pastes never change an existing date or save", async () => {
  const d = await dashboard();
  try {
    const cell = field(d, "saved-a", "letterDate"); cell.value = "01/10/2026";
    for (const source of ["31/02/2026", "29/02/2026", "31/04/2026", "00/11/2026", "01/13/2026", "01/01/0000", "2026-02-30", "not a date", ""]) {
      const event = new d.w.Event("paste", { bubbles:true, cancelable:true });
      Object.defineProperty(event, "clipboardData", { value:{ getData: () => source } });
      cell.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true); assert.equal(cell.value, "01/10/2026", source);
      assert.match(d.w.document.getElementById("case-sheet-status").textContent, /valid.*date|one cell/);
    }
    for (const lock of ["readOnly", "disabled"]) {
      cell[lock] = true;
      const event = new d.w.Event("paste", { bubbles:true, cancelable:true });
      Object.defineProperty(event, "clipboardData", { value:{ getData: () => "05/11/2026" } });
      cell.dispatchEvent(event); assert.equal(cell.value, "01/10/2026"); cell[lock] = false;
    }
    assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("typed Cases dates render day-first through save, refresh, Escape, invalid edits and clearing", async () => {
  const d = await dashboard();
  try {
    d.rows[0].letter_date = "2026-11-05";
    await d.api.loadSharedCases(); d.api.renderCases();
    let cell = field(d, "saved-a", "letterDate");
    assert.equal(cell.value, "05/11/2026");
    assert.equal(d.w.document.querySelector('[data-case-derived="dueDate"]').textContent, "20/11/2026");
    cell.value = "5/11/2026"; await d.api.saveCaseSheetCell(cell);
    assert.equal(cell.value, "05/11/2026"); assert.equal(d.writes.length, 0);
    cell.value = "12/03/2027"; d.delay();
    const save = d.api.saveCaseSheetCell(cell); await tick();
    assert.equal(cell.value, "12/03/2027"); assert.equal(cell.disabled, true);
    assert.equal(cell.closest(".case-sheet-date").querySelector("button").disabled, true);
    assert.equal(d.api.getRows()[0].letterDate, "2026-11-05");
    d.release(); await save;
    assert.equal(d.writes.at(-1).case.letterDate, "2027-03-12");
    assert.equal(cell.value, "12/03/2027"); assert.equal(cell.disabled, false);
    d.rows[0].letter_date = "2027-03-12";
    await d.api.loadSharedCases(); d.api.renderCases(); cell = field(d, "saved-a", "letterDate");
    assert.equal(cell.value, "12/03/2027");
    cell.value = "21/04/2027";
    cell.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
    assert.equal(cell.value, "12/03/2027");
    const before = d.writes.length;
    for (const value of ["31/02/2027", "11/23/2027", "12/03/27", "partial"]) {
      cell.value = value; await d.api.saveCaseSheetCell(cell);
      assert.equal(cell.value, "12/03/2027"); assert.equal(d.writes.length, before);
      assert.match(d.w.document.getElementById("case-sheet-status").textContent, /Date not saved/);
    }
    cell.value = ""; await d.api.saveCaseSheetCell(cell);
    assert.equal(d.writes.at(-1).case.letterDate, ""); assert.equal(cell.value, "");
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("Cases calendar selection and failed saves retain fixed day-first display", async () => {
  const d = await dashboard("supervisor", {}, false, "?casesFullscreen=1&account=auth-user-1");
  try {
    const cell = field(d, "saved-a", "receivedDate"), wrap = cell.closest(".case-sheet-date");
    const picker = wrap.querySelector("[data-case-date-picker]"); let opened = false;
    picker.showPicker = () => { opened = true; };
    wrap.querySelector("button").click(); assert.equal(opened, true);
    assert.equal(d.w.document.activeElement, cell); opened = false;
    cell.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"ArrowDown", altKey:true, bubbles:true, cancelable:true }));
    assert.equal(opened, true);
    picker.value = "2026-12-04";
    picker.dispatchEvent(new d.w.Event("change", { bubbles:true })); await tick();
    assert.equal(d.writes.at(-1).case.receivedDate, "2026-12-04");
    assert.equal(cell.value, "04/12/2026"); assert.equal(picker.value, "2026-12-04");
    d.fail(); cell.value = "05/12/2026"; await d.api.saveCaseSheetCell(cell);
    assert.equal(cell.value, "04/12/2026"); assert.equal(picker.value, "2026-12-04");
    assert.match(d.w.document.getElementById("case-sheet-status").textContent, /Not saved/);
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("expanded case details are viewport-sized and remain wrapped after progress refresh in dashboard and full-screen layouts", async () => {
  assert.match(html, /container:case-sheet-viewport \/ inline-size/);
  assert.match(html, /\.case-progress-viewport \{ position:sticky; left:0; width:min\(100%, calc\(100cqw - 1px\)\)/);
  assert.match(html, /@container case-sheet-viewport \(max-width:720px\)/);
  for (const query of ["", "?casesFullscreen=1&account=auth-user-1"]) {
    const d = await dashboard("supervisor", {}, false, query);
    try {
      d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click(); await tick();
      const panel = d.w.document.querySelector(".case-progress-inline td");
      assert.equal(panel.children.length, 1);
      assert.ok(panel.firstElementChild.classList.contains("case-progress-viewport"));
      assert.ok(panel.querySelector("#himbauan-progress-entry"));
      await d.api.loadCaseProgress("saved-a");
      assert.equal(panel.children.length, 1);
      assert.ok(panel.firstElementChild.classList.contains("case-progress-viewport"));
      assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
    } finally { d.dom.window.close(); }
  }
});

test("Cases Full Screen links open the current category in an account-bound isolated tab", async () => {
  const d = await dashboard();
  try {
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    const link = d.w.document.querySelector("[data-case-fullscreen]");
    const url = new URL(link.href);
    assert.equal(url.origin, "http://localhost"); assert.equal(url.pathname, "/demo.html");
    assert.equal(url.searchParams.get("casesFullscreen"), "1");
    assert.equal(url.searchParams.get("casesTab"), "pemeriksaan");
    assert.equal(url.searchParams.get("account"), "auth-user-1");
    assert.equal(link.target, "_blank"); assert.match(link.rel, /noopener/);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("standalone Cases keeps saved filters/widths, both categories, refresh URLs and original dashboard navigation", async () => {
  const saved = { currentView:"allocation-view", caseTaxFilter:"tax-a", caseColumnWidths:{ himbauan:{ clientName:320 } }, appearance:{ theme:"dark", accent:"#087f8d" } };
  const d = await dashboard("supervisor", saved, false, "?casesFullscreen=1&casesTab=himbauan&account=auth-user-1");
  try {
    assert.equal(d.api.state.currentView, "cases-view");
    assert.ok(d.w.document.documentElement.classList.contains("cases-fullscreen"));
    assert.equal(d.w.document.querySelector("[data-case-fullscreen]"), null);
    assert.ok(d.w.document.querySelector('a[aria-label="Back to Dashboard"]'));
    assert.deepEqual(visible(d), ["saved-a", "saved-c"]);
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "320px");
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    assert.equal(new URL(d.w.location.href).searchParams.get("casesTab"), "pemeriksaan");
    assert.equal(new URL(d.w.location.href).searchParams.get("casesFullscreen"), "1");
    assert.equal(new URL(d.w.location.href).searchParams.get("account"), "auth-user-1");
    assert.equal(JSON.parse(d.w.localStorage.getItem("tax-practice-v2:auth-user-1")).ui.currentView, "allocation-view");
    const changedMain = JSON.parse(d.w.localStorage.getItem("tax-practice-v2:auth-user-1"));
    changedMain.ui.currentView = "profile-view";
    d.w.localStorage.setItem("tax-practice-v2:auth-user-1", JSON.stringify(changedMain));
    d.w.document.querySelector("[data-case-sheet-reset]").click();
    assert.equal(JSON.parse(d.w.localStorage.getItem("tax-practice-v2:auth-user-1")).ui.currentView, "profile-view");
    assert.ok(d.reads.includes("/api/cases")); assert.ok(d.reads.includes("/api/staff"));
    assert.ok(d.reads.includes("/api/my-work"));
    assert.equal(d.reads.some(url => url.includes("/api/operations") || url.includes("/api/annual-sheet") || url.includes("/api/announcements") || url.includes("/api/performance")), false);
    assert.equal(d.writes.length, 0); assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("full-screen links block pending saves and live drafts rather than showing an older database copy", async () => {
  const d = await dashboard();
  try {
    const subject = field(d, "saved-a", "subject"); subject.value = "Saving now";
    d.delay(); const save = d.api.saveCaseSheetCell(subject); await tick();
    let event = new d.w.MouseEvent("click", { bubbles:true, cancelable:true });
    d.w.document.querySelector("[data-case-fullscreen]").dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.match(d.w.document.getElementById("case-sheet-status").textContent, /save to finish/);
    d.release(); await save;
    d.w.document.querySelector("[data-new-case]").click();
    event = new d.w.MouseEvent("click", { bubbles:true, cancelable:true });
    d.w.document.querySelector("[data-case-fullscreen]").dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.match(d.w.document.getElementById("case-sheet-status").textContent, /new case drafts/);
  } finally { d.dom.window.close(); }
});

test("an account-bound full-screen URL cannot load another signed-in user's workspace", async () => {
  const d = await dashboard("supervisor", {}, false, "?casesFullscreen=1&account=other-user", true);
  try {
    assert.match(d.w.document.body.textContent, /signed-in account changed/);
    assert.deepEqual(d.reads, ["/api/profile"]); assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("column preferences sync between dashboard and full-screen tabs without replacing editors or accepting another account's settings", async () => {
  const d = await dashboard();
  try {
    const subject = field(d, "saved-a", "subject"); subject.focus(); subject.value = "Uncommitted typing";
    const newValue = JSON.stringify({ ui:{ caseColumnWidths:{ himbauan:{ clientName:360 }, pemeriksaan:{ subject:240 } } } });
    d.w.dispatchEvent(new d.w.StorageEvent("storage", { key:"tax-practice-v2:other-account", newValue }));
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "");
    d.w.dispatchEvent(new d.w.StorageEvent("storage", { key:"tax-practice-v2:auth-user-1", newValue }));
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "360px");
    assert.equal(field(d, "saved-a", "subject"), subject); assert.equal(subject.value, "Uncommitted typing");
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("demo case expansion shows useful work context and permits demo follow-ups without asking to save or writing to the API", async () => {
  const d = await dashboard("staff", {}, true);
  try {
    d.api.state.currentView = "cases-view"; d.api.state.selectedPic = "Bagus"; d.api.renderCases();
    const toggle = d.w.document.querySelector("[data-toggle-himbauan-progress]");
    const id = toggle.dataset.toggleHimbauanProgress;
    const record = d.api.getRows().find((row: any) => row.id === id);
    record.nextSteps = [{ title:"Collect supporting documents", done:false }];
    d.api.state.myWork = [{ id:"open-task", caseId:id, title:"Prepare explanation memo", done:false }];
    d.api.renderCases(); d.w.document.querySelector(`[data-toggle-himbauan-progress="${id}"]`).click(); await tick();
    const panel = d.w.document.querySelector(".case-progress-inline");
    assert.match(panel.textContent, /Demo preview/);
    assert.doesNotMatch(panel.textContent, /Save this Himbauan first|New case draft/);
    assert.match(panel.textContent, /Collect supporting documents/);
    assert.match(panel.textContent, /Prepare explanation memo/);
    assert.ok(panel.textContent.includes(record.notes));
    const input = d.w.document.getElementById("himbauan-progress-entry");
    assert.equal(input.disabled, false); input.value = "Received partial records; follow up tomorrow";
    panel.querySelector("[data-add-himbauan-progress]").click(); await tick();
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /Received partial records/);
    assert.equal(d.writes.length, 0);
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("live drafts explain automatic saving, then activate progress after the database creates the case", async () => {
  const d = await dashboard();
  try {
    d.w.document.querySelector("[data-new-case]").click();
    const draft = d.api.getRows().find((row: any) => row.id.startsWith("case-"));
    d.w.document.querySelector(`[data-toggle-himbauan-progress="${draft.id}"]`).click(); await tick();
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /leave the cell to save automatically/);
    assert.equal(d.w.document.getElementById("himbauan-progress-entry").disabled, true);
    d.w.document.querySelector("[data-case-focus-client]").click();
    const client = field(d, draft.id, "clientName"); assert.equal(d.w.document.activeElement, client);
    client.value = "Alpha"; await d.api.saveCaseSheetCell(client); await tick();
    assert.equal(draft.id, "saved-new");
    assert.equal(d.w.document.getElementById("himbauan-progress-entry").disabled, false);
    assert.doesNotMatch(d.w.document.querySelector(".case-progress-inline").textContent, /New case draft/);
  } finally { d.dom.window.close(); }
});

test("progress failures offer retry, and loading updates never replaces an edited sheet cell", async () => {
  const d = await dashboard();
  try {
    const originalFetch = d.w.fetch;
    d.w.fetch = async (url: string, init: any) => url.includes("progressFor=") ? { ok:false, json:async () => ({ error:"Progress unavailable" }) } : originalFetch(url, init);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click(); await tick();
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /Progress unavailable/);
    assert.ok(d.w.document.querySelector("[data-case-reload-progress]"));
    const subject = field(d, "saved-a", "subject"); subject.focus(); subject.value = "Still typing";
    d.w.fetch = originalFetch; await d.api.loadCaseProgress("saved-a");
    assert.equal(field(d, "saved-a", "subject"), subject); assert.equal(subject.value, "Still typing");
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /Linked completed task/);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("dragging column borders saves account-scoped widths that survive navigation and reload without database writes", async () => {
  const d = await dashboard();
  let savedUi;
  try {
    const handle = d.w.document.querySelector('[data-case-resize="clientName"]');
    handle.dispatchEvent(new d.w.MouseEvent("pointerdown", { bubbles:true, button:0, clientX:200 }));
    d.w.document.dispatchEvent(new d.w.MouseEvent("pointermove", { bubbles:true, clientX:280 }));
    d.w.document.dispatchEvent(new d.w.MouseEvent("pointerup", { bubbles:true, clientX:280 }));
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "300px");
    assert.equal(handle.getAttribute("aria-valuenow"), "300");
    savedUi = JSON.parse(d.w.localStorage.getItem("tax-practice-v2:auth-user-1")).ui;
    assert.equal(savedUi.caseColumnWidths.himbauan.clientName, 300);
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "");
    d.w.document.querySelector('[data-cases-tab="himbauan"]').click();
    assert.equal(d.w.document.querySelector('[data-case-column="clientName"]').style.width, "300px");
    assert.equal(d.w.document.body.classList.contains("case-column-resizing"), false);
    assert.equal(d.api.state.caseSheetSort.direction, "asc");
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
  const reopened = await dashboard("supervisor", savedUi);
  try {
    assert.equal(reopened.w.document.querySelector('[data-case-column="clientName"]').style.width, "300px");
    assert.deepEqual(reopened.warnings, []);
  } finally { reopened.dom.window.close(); }
});

test("column resizing is keyboard accessible, bounded and individually resettable", async () => {
  const d = await dashboard();
  try {
    const handle = d.w.document.querySelector('[data-case-resize="subject"]');
    handle.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"ArrowRight", shiftKey:true, bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "174");
    for (let i = 0; i < 30; i++) handle.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"ArrowRight", shiftKey:true, bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "640");
    handle.dispatchEvent(new d.w.MouseEvent("dblclick", { bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "150");
    for (let i = 0; i < 10; i++) handle.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"ArrowLeft", shiftKey:true, bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "72");
    handle.dispatchEvent(new d.w.KeyboardEvent("keydown", { key:"Home", bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "150");
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("cancelled column drags restore original widths without saving changes", async () => {
  const d = await dashboard();
  try {
    const handle = d.w.document.querySelector('[data-case-resize="notes"]');
    handle.dispatchEvent(new d.w.MouseEvent("pointerdown", { bubbles:true, button:0, clientX:200 }));
    d.w.document.dispatchEvent(new d.w.MouseEvent("pointermove", { bubbles:true, clientX:260 }));
    assert.equal(handle.getAttribute("aria-valuenow"), "220");
    d.w.document.dispatchEvent(new d.w.Event("pointercancel", { bubbles:true }));
    assert.equal(handle.getAttribute("aria-valuenow"), "160");
    assert.equal(d.w.document.querySelector('[data-case-column="notes"]').style.width, "");
    assert.equal(d.w.document.body.classList.contains("case-column-resizing"), false);
    assert.equal(d.api.state.caseColumnWidths.himbauan.notes, undefined);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("case presentation integrates navigation and filters with intentional column sizes and accessible categories", async () => {
  const d = await dashboard();
  try {
    for (const category of ["himbauan", "pemeriksaan"]) {
      d.w.document.querySelector(`[data-cases-tab="${category}"]`).click();
      const panel = d.w.document.querySelector("#cases-view .case-sheet-panel");
      assert.ok(panel.querySelector(".case-sheet-nav"));
      assert.ok(panel.querySelector(".case-search-wrap #case-search"));
      assert.equal(panel.querySelectorAll(".case-filter-pair select").length, 2);
      assert.equal(panel.querySelectorAll("colgroup col").length, 13);
      assert.equal(panel.querySelectorAll('[data-case-column-group="ownership"]').length, category === "himbauan" ? 2 : 3);
      assert.equal(panel.querySelector(`[data-cases-tab="${category}"]`).getAttribute("aria-pressed"), "true");
      assert.match(panel.querySelector(".case-filter-result").textContent, /of.*cases/);
      assert.ok(panel.querySelector(".case-col-clientName"));
      assert.ok(panel.querySelector(".case-col-actions"));
      assert.equal(panel.querySelector("[data-virtual-table]").getAttribute("tabindex"), "0");
    }
    assert.deepEqual(d.warnings, []); assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("Cases retains both original column sets, simultaneous PIC filters, header sorting and Reset", async () => {
  const d = await dashboard();
  try {
    assert.deepEqual(d.warnings, []);
    assert.deepEqual(visible(d), ["saved-a", "saved-b", "saved-c"]);
    for (const [id, value] of [["case-acc-filter", "acc-a"], ["case-tax-filter", "tax-a"]]) {
      const select = d.w.document.getElementById(id); select.value = value; select.dispatchEvent(new d.w.Event("change", { bubbles: true }));
    }
    assert.deepEqual(visible(d), ["saved-a"]);
    d.w.document.querySelector("[data-case-sheet-reset]").click();
    d.w.document.querySelector('[data-case-sheet-sort="clientName"]').click();
    assert.deepEqual(visible(d), ["saved-a", "saved-b", "saved-c"]);
    d.w.document.querySelector('[data-case-sheet-sort="clientName"]').click();
    assert.deepEqual(visible(d), ["saved-c", "saved-b", "saved-a"]);
    assert.equal(d.w.document.querySelector('[aria-sort="descending"]').textContent.trim().startsWith("Wajib Pajak"), true);
    d.w.document.querySelector("[data-case-sheet-reset]").click();
    assert.equal(d.api.state.caseSheetSort.direction, "asc");
    assert.deepEqual([...d.w.document.querySelectorAll(".case-sheet th")].map((th: any) => th.textContent.replace(/[↑↓↕]/g, "").trim()), ["No.", "Wajib Pajak", "No Surat", "Tgl Surat", "Tgl Terima", "Perihal", "Jatuh Tempo", "Deadline", "Tgl Selesai", "PIC Tax", "PIC ACC", "Note", "Actions"]);
    d.w.document.querySelector('[data-cases-tab="pemeriksaan"]').click();
    for (const title of ["Tahun Pajak", "PIC Pemeriksa", "Tgl SPHP", "Penyelesaian"]) assert.ok(d.w.document.querySelector(".case-sheet thead").textContent.includes(title));
    assert.deepEqual(visible(d), ["saved-d"]);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("sheet edits publish only confirmed values, serialize versions, preserve pending rows during refresh and roll back conflicts", async () => {
  const d = await dashboard();
  try {
    const record = d.api.getRows().find((row: any) => row.id === "saved-a");
    const subject = field(d, "saved-a", "subject"); subject.value = "First edit";
    d.delay(); const first = d.api.saveCaseSheetCell(subject); await tick();
    assert.equal(record.subject, "Original"); assert.equal(subject.disabled, true);
    await d.api.loadSharedCases(true);
    assert.equal(d.api.getRows().find((row: any) => row.id === record.id), record);
    const letter = field(d, "saved-a", "letterNumber"); letter.value = "Second edit";
    const second = d.api.saveCaseSheetCell(letter);
    assert.equal(d.writes.length, 1);
    d.release(); await first; await second;
    assert.equal(record.subject, "First edit"); assert.equal(record.letterNumber, "Second edit");
    assert.equal(d.writes[0].version, "v1"); assert.equal(d.writes[1].version, "v2");
    assert.equal(d.writes[1].case.subject, "First edit");
    d.fail(); const currentSubject = field(d, "saved-a", "subject"); currentSubject.value = "Rejected edit"; await d.api.saveCaseSheetCell(currentSubject);
    assert.equal(record.subject, "First edit"); assert.equal(currentSubject.value, "First edit");
    assert.match(d.w.document.getElementById("case-sheet-status").textContent, /Not saved.*another user/);
    assert.equal(d.api.state.syncIssues.length, 0, "rolled-back edits must not appear as local pending changes");
  } finally { d.dom.window.close(); }
});

test("spreadsheet navigation and progress do not open extra editors; staff cannot reassign PIC", async () => {
  const d = await dashboard("staff");
  try {
    assert.deepEqual(visible(d), ["saved-a", "saved-c"]);
    assert.equal(d.w.document.querySelector('select[data-case-sheet-field$="PicProfileId"]'), null);
    const cell = field(d, "saved-a", "subject"); cell.focus();
    cell.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(d.w.document.activeElement, field(d, "saved-c", "subject"));
    const next = field(d, "saved-c", "subject"); next.value = "Uncommitted";
    next.dispatchEvent(new d.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(next.value, "Original");
    next.click(); assert.equal(d.w.document.querySelector(".case-progress-inline"), null);
    d.w.document.querySelector('[data-toggle-himbauan-progress="saved-a"]').click(); await tick();
    assert.match(d.w.document.querySelector(".case-progress-inline").textContent, /Linked completed task/);
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("new cases require a valid Client Master link, retain draft fields, and receive database identity", async () => {
  const d = await dashboard();
  try {
    d.w.document.querySelector("[data-new-case]").click();
    const draft = d.api.getRows().find((row: any) => row.id.startsWith("case-"));
    const subject = field(d, draft.id, "subject"); subject.value = "Draft subject"; d.api.saveCaseSheetCell(subject);
    const client = field(d, draft.id, "clientName"); client.value = "Unknown company"; await d.api.saveCaseSheetCell(client);
    assert.equal(d.writes.length, 0); assert.equal(draft.clientName, "");
    assert.equal(client.value, "");
    client.value = "Alpha"; await d.api.saveCaseSheetCell(client);
    assert.equal(draft.id, "saved-new"); assert.equal(d.writes[0].case.clientId, "master-1");
    assert.equal(d.writes[0].case.subject, "Draft subject"); assert.equal(client.readOnly, true);
    assert.ok(field(d, "saved-new", "subject"));
  } finally { d.dom.window.close(); }
});

test("edits made during new-case creation queue behind the POST without losing draft values", async () => {
  const d = await dashboard();
  try {
    d.w.document.querySelector("[data-new-case]").click();
    const draft = d.api.getRows().find((row: any) => row.id.startsWith("case-"));
    const client = field(d, draft.id, "clientName"); client.value = "Alpha";
    d.delay(); const create = d.api.saveCaseSheetCell(client); await tick();
    const subject = field(d, draft.id, "subject"); subject.value = "Typed while creating";
    const edit = d.api.saveCaseSheetCell(subject);
    d.release(); await create; await edit;
    assert.equal(d.writes.length, 2);
    assert.equal(d.writes[1].id, "saved-new"); assert.equal(d.writes[1].version, "v2");
    assert.equal(draft.subject, "Typed while creating");
    assert.equal(field(d, "saved-new", "subject").value, "Typed while creating");
    assert.equal(d.w.document.querySelector('[data-case-sheet-row="saved-new"] select[aria-label="Tax Team case PIC"]') !== null, true);
  } finally { d.dom.window.close(); }
});

test("search applies short text, combines with filters and reset; range paste never corrupts a cell", async () => {
  const d = await dashboard();
  try {
    const search = d.w.document.getElementById("case-search"); search.value = "Be";
    search.dispatchEvent(new d.w.Event("input", { bubbles: true }));
    assert.deepEqual(visible(d), ["saved-b"]);
    d.w.document.querySelector("[data-case-sheet-reset]").click();
    const cell = field(d, "saved-a", "subject");
    const paste = new d.w.Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { getData: () => "Alpha\tBeta\nGamma" } });
    cell.dispatchEvent(paste);
    assert.equal(paste.defaultPrevented, true); assert.equal(cell.value, "Original");
    assert.equal(d.writes.length, 0);
  } finally { d.dom.window.close(); }
});

test("historical PIC names without profile IDs do not become visually unassigned after editing another cell", async () => {
  const d = await dashboard();
  try {
    d.rows[0].tax_pic_profile_id = ""; d.rows[0].tax_pic_name = "Former Tax PIC";
    await d.api.loadSharedCases(true);
    const pic = field(d, "saved-a", "taxPicProfileId");
    assert.equal(pic.value, "legacy"); assert.equal(pic.selectedOptions[0].textContent, "Former Tax PIC");
    const subject = field(d, "saved-a", "subject"); subject.value = "Updated subject";
    await d.api.saveCaseSheetCell(subject);
    assert.equal(pic.value, "legacy"); assert.equal(pic.selectedOptions[0].textContent, "Former Tax PIC");
    assert.equal(d.writes[0].case.taxPic, "Former Tax PIC");
  } finally { d.dom.window.close(); }
});
