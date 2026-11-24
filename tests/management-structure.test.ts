import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8");
const roster = [
  {id:"a", display_name:"Dewa",role:"partner",employment_title:"Managing Partner"},
  {id:"b", display_name:"Future Lead",role:"leader"},
  {id:"c", display_name:"Archived PIC", directory_active:false}
];

function setup(staff = roster) {
  const dom = new JSDOM("<section data-structure-host></section>",{url:"https://test.local/demo.html", runScripts:"outside-only"});
  const w = dom.window as any, host = w.document.querySelector("section");
  w.structuredClone = structuredClone;
  w.confirm = () => true;
  w.eval(read("vendor/purify.min.js"));
  w.eval(read("management-structure.js"));
  const mount = (account = "manager", canManage = () => true, clients: any[] | null = null, getAllocationDrafts = () => ({}), loadSharedDraft: (() => Promise<unknown>) | null = null) => {
    const editor = w.ManagementStructure.create({account, canManage, getAllocationDrafts, loadSharedDraft, safeHtml: (html:string) => w.DOMPurify.sanitize(html,{USE_PROFILES:{html:true,svg:true}})});
    editor.mount(host, staff, clients);
    return editor;
  };
  const click = (action:string) => host.querySelector(`[data-structure-action="${action}"]`).click();
  const submit = (fields:Record<string,string>) => {
    const form = host.querySelector('[data-structure-form="node"]');
    for (const [name,value] of Object.entries(fields)) form.elements.namedItem(name).value = value;
    form.requestSubmit();
  };
  const saved = () => JSON.parse(w.localStorage.getItem("tax-dashboard:structure:v1:manager"));
  return {dom, w, host, mount, click, submit, saved};
}

test("Team Split suggests ownership from Current PICs and checks confirmed ownership against Next PIC drafts", () => {
  const x = setup([
    {id:"lead-a",display_name:"Leader Alpha",role:"leader"},
    {id:"lead-b",display_name:"Leader Beta",role:"leader"},
    {id:"tax-a",display_name:"Tax Alpha",role:"staff"},
    {id:"acc-a",display_name:"Accounting Alpha",role:"staff"},
    {id:"tax-b",display_name:"Tax Beta",role:"staff"},
    {id:"acc-b",display_name:"Accounting Beta",role:"staff"}
  ]);
  try {
    const pair = (id:string,label:string) => [id,label];
    const nodes = [
      ["1","lead-a",""],["2","lead-b",""],["3","tax-a","1"],["4","acc-a","1"],["5","tax-b","2"],["6","acc-b","2"]
    ].map(([id,pic,parent]) => ({id,pic,parent,label:pic,kind:id === "1" || id === "2" ? "Leader" : "Role",picName:pic}));
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[{id:"1",name:"Split proposal",nodes}]}));
    const aligned = {id:"c1",databaseId:"db-c1",name:"Aligned",clientStatus:"Active",reportingAssignments:{tax:pair("tax-a","Tax Alpha"),accounting:pair("acc-a","Accounting Alpha")}};
    const mixed = {id:"c2",name:"Mixed",clientStatus:"Active",taxPicProfileId:"tax-a",accountingPicProfileId:"acc-b"};
    const solo = {id:"c3",name:"Single PIC",clientStatus:"Active",taxPicProfileId:"tax-b"};
    const unknown = {id:"c4",name:"Unmapped",clientStatus:"Active",taxPic:"Other person",accountingPicProfileId:"acc-a"};
    const archived = {id:"c5",name:"Archived",clientStatus:"Inactive",taxPicProfileId:"tax-a"};
    const drafts = {c1:{nextTaxPic:"TAX BETA",nextAccPic:"Accounting Beta"},c2:{nextTaxPic:"Tax Beta"},c3:{nextTaxPic:""}};
    const rows = [aligned,mixed,solo,unknown,archived];
    const editor = x.mount("manager",() => true,rows,() => drafts);
    const select = (selector:string,value:string) => {
      const control = x.host.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new x.w.Event("change",{bubbles:true}));
    };
    const row = (key:string) => x.host.querySelector(`[data-structure-confirm-owner="${key}"]`).closest("tr");
    const findings = (key:string) => row(key).querySelector("[data-structure-split-result]").textContent;
    x.host.querySelector('[data-structure-section="split"]').click();
    assert.equal(x.host.querySelector('[data-structure-split="a"]').value,"1");
    assert.equal(x.host.querySelector('[data-structure-split="b"]').value,"2");
    assert.equal(row("db-c1").querySelector("[data-structure-owner]").value,"1");
    assert.equal(row("c3").querySelector("[data-structure-owner]").value,"2");
    for (const key of ["db-c1","c3"]) assert.equal(row(key).querySelector(".structure-split-owner + small"),null);
    assert.match(findings("c2"),/split/);
    assert.equal(row("c4").querySelector(".structure-split-owner + small"),null);
    assert.equal(row("c4").querySelector("[data-structure-owner]").value,"");
    assert.doesNotMatch(x.host.querySelector(".structure-review tbody").textContent,/Archived/);
    assert.equal(x.saved().plans[0].teamSplit,undefined,"suggestions must not confirm themselves");
    select('[data-structure-split="mode"]',"next");
    assert.equal(findings("db-c1"),"Projected team change");
    assert.equal(findings("c2"),"Within one team","the Accounting PIC has no draft and keeps its current assignment");
    assert.match(row("c3").textContent,/Unassigned/);
    x.click("confirm-suggestions");
    assert.deepEqual(x.saved().plans[0].teamSplit.owners,{"db-c1":"1",c3:"2"});
    assert.equal(row("db-c1").querySelector(".structure-split-owner + small").textContent,"Confirmed");
    assert.equal(findings("db-c1"),"Outside intended team");
    assert.equal(findings("c3"),"Check PIC or chart");
    select('[data-structure-split="mode"]',"current");
    assert.equal(findings("db-c1"),"Within one team");
    select('[data-structure-split="b"]',"3");
    assert.match(x.host.querySelector("[data-structure-status]").textContent,/must be separate/);
    assert.equal(x.saved().plans[0].teamSplit.b,"2");
    editor.refreshClients([{...aligned,reportingAssignments:{tax:pair("tax-b","Tax Beta"),accounting:pair("acc-b","Accounting Beta")}},...rows.slice(1)]);
    assert.equal(findings("db-c1"),"Outside intended team","confirmed ownership is independent of a saved Allocation change");
    row("c2").querySelector("[data-structure-owner]").value = "2";
    row("c2").querySelector("[data-structure-confirm-owner]").click();
    assert.equal(findings("c2"),"Outside intended team");
    assert.equal(x.saved().plans[0].teamSplit.owners.c2,"2");
    x.host.querySelector('[data-structure-section="chart"]').click();
    x.host.querySelector('[data-structure-edit="2"]').click();
    x.click("remove");
    assert.deepEqual(x.saved().plans[0].teamSplit,{a:"1",b:"",c:"",owners:{}});
  } finally { x.dom.window.close(); }
});

test("PIC recommendations keep existing in-team and blank roles, balance replacements, and never write drafts", () => {
  const staff = [
    {id:"a",display_name:"Lead A",role:"leader"},
    {id:"b",display_name:"Lead B",role:"leader"},
    {id:"a1",display_name:"A Tax One",role:"staff",team_division:"Tax Team"},
    {id:"a2",display_name:"A Tax Two",role:"staff",team_division:"Tax Team"},
    {id:"b1",display_name:"B Tax",role:"staff",team_division:"Tax Team"},
    {id:"a3",display_name:"A Accounting",role:"staff",team_division:"Accounting Team"},
    {id:"not-pic",display_name:"A Partner",role:"partner",team_division:"Tax Team"},
    {id:"ambiguous-a",display_name:"Twin",role:"staff",team_division:"Tax Team"},
    {id:"ambiguous-b",display_name:"Twin",role:"staff",team_division:"Tax Team"}
  ];
  const x = setup(staff);
  try {
    const nodes = staff.slice(0,-1).map(({id,role},index) => ({id:String(index+1),label:id,pic:id,parent:index<2 ? "" : id==="b1" ? "2" : "1",
      kind:role==="leader" ? "Leader" : role==="partner" ? "Partner" : "Role"}));
    const owners = {keep:"1",first:"1",second:"1",third:"1",noEligible:"2"};
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[
      {id:"1",name:"Split",nodes,teamSplit:{a:"1",b:"2",owners}}
    ]}));
    const row = (id:string,name:string,taxPicProfileId:string,accountingPicProfileId="") =>
      ({id,name,clientStatus:"Active",taxPicProfileId,accountingPicProfileId});
    const clients = [
      row("keep","Existing","a1","a3"),
      row("first","Move 1","b1"),
      row("second","Move 2","b1"),
      row("third","Move 3","b1"),
      row("noEligible","No eligible","b1","a3"),
      row("unconfirmed","Not decided","a1","a3"),
    ];
    const drafts = {first:{nextTaxPic:"A Tax Two"}};
    x.mount("manager",() => true,clients,() => drafts);
    x.host.querySelector('[data-structure-section="split"]').click();
    assert.equal(x.host.querySelector('[data-structure-section="conflicts"]'),null);
    x.host.querySelector(".structure-review-table").scrollTop = 180;
    x.click("recommend-pics");
    assert.equal(x.host.querySelector(".structure-review-table").scrollTop,180);
    const recommendation = (id:string) => x.host.querySelector(`[data-structure-confirm-owner="${id}"]`).closest("tr").querySelector("[data-structure-recommendation]").textContent;
    assert.match(recommendation("keep"),/Keep existing PICs/);
    assert.match(recommendation("first"),/Tax PIC: B Tax . A Tax Two/);
    // The existing and unconfirmed clients are both retained in A Tax One's workload.
    assert.match(recommendation("second"),/Tax PIC: B Tax . A Tax Two/);
    assert.match(recommendation("third"),/Tax PIC: B Tax . A Tax One/);
    assert.doesNotMatch(recommendation("first"),/Accounting/);
    assert.match(recommendation("noEligible"),/No eligible Accounting PIC/);
    assert.match(recommendation("unconfirmed"),/Confirm an intended team/);
    const mode = x.host.querySelector('[data-structure-split="mode"]');
    mode.value = "next";
    mode.dispatchEvent(new x.w.Event("change",{bubbles:true}));
    assert.match(recommendation("first"),/Keep existing PICs/);
    assert.deepEqual(drafts,{first:{nextTaxPic:"A Tax Two"}});
    assert.deepEqual(x.saved().plans[0].teamSplit.owners,owners);
  } finally { x.dom.window.close(); }
});

test("Structure edits the last active chart without exposing scenario controls or deleting other saved plans", () => {
  const x = setup();
  try {
    const older = {id:"1",name:"Earlier proposal",nodes:[{id:"1",parent:"",pic:"",kind:"Partner",label:"Earlier position"}]};
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"2",plans:[
      older,{id:"2",name:"Company structure",nodes:[]}
    ]}));
    x.mount();
    assert.equal(x.host.querySelector(".structure-chart-head h4").textContent,"Team Dewa Structure");
    assert.equal(x.host.querySelector('[data-structure-plan], [data-structure-form="name"], [data-structure-action="new"], [data-structure-action="copy"], [data-structure-action="delete-plan"]'),null);
    assert.doesNotMatch(x.host.textContent,/Archived PIC/);
    x.submit({label:"Managing Partner", pic:"a"});
    x.submit({label:"Tax Team", kind:"Team", parent:"1", pic:"b"});
    assert.equal(x.host.querySelectorAll(".structure-wires path").length,1);
    assert.match(x.host.querySelector(".structure-chart").textContent,/Dewa/);
    x.host.querySelector('[data-structure-edit="1"]').click();
    assert.equal(x.host.querySelector('[name="parent"] option[value="2"]'),null,"can't report to a descendant");
    x.submit({label:"Incoming Partner",pic:""});
    assert.deepEqual(x.saved().plans[0],older);
    assert.equal(x.saved().plans[1].nodes[0].label,"Incoming Partner");
    assert.equal(x.saved().plans[1].nodes[0].pic,"");
    const refreshed = x.host.cloneNode(false);
    x.host.replaceWith(refreshed);
    const editor = x.w.ManagementStructure.create({account:"manager", canManage:()=>true, safeHtml:x.w.DOMPurify.sanitize});
    editor.mount(refreshed,roster);
    assert.match(refreshed.querySelector(".structure-chart").textContent,/Incoming Partner/);
    editor.mount(refreshed,[{id:"b",display_name:"New Display Name"}]);
    assert.match(refreshed.querySelector(".structure-chart").textContent,/New Display Name/);
  } finally { x.dom.window.close(); }
});

test("Structure summarizes current team loads without double-counting roles or rebuilding the chart on data refresh", () => {
  const x = setup();
  try {
    const nodes = [
      {id:"1",kind:"Leader",label:"Branch A",parent:"",pic:"a"},
      {id:"2",kind:"Leader",label:"Branch B",parent:"",pic:"b"}
    ];
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[
      {id:"1",name:"Split baseline",nodes,teamSplit:{a:"1",b:"2",owners:{bothRoles:"2"}}}
    ]}));
    const editor = x.mount();
    const summary = () => x.host.querySelector("[data-structure-load]");
    const count = (team:string) => summary().querySelector(`[data-structure-load-team="${team}"] [data-structure-load-count]`).textContent;
    const status = () => summary().querySelector("[data-structure-load-status]").textContent;
    assert.match(summary().textContent,/Waiting for confirmed Client Master data/);
    const canvas = x.host.querySelector(".structure-viewport");
    const client = (id:string,taxPicProfileId:string,accountingPicProfileId="",clientStatus="Active") =>
      ({id,name:id,clientStatus,taxPicProfileId,accountingPicProfileId});
    const clients = [
      client("bothRoles","a","a"),
      client("oneMapped","a","unknown"),
      client("bOnly","b"),
      client("shared","a","b"),
      client("noPIC",""),
      client("archived","b","","Inactive")
    ];
    editor.mount(x.host,roster,clients);
    assert.equal(x.host.querySelector(".structure-viewport"),canvas);
    assert.equal(count("a"),"3");
    assert.equal(count("b"),"2");
    assert.match(summary().querySelector('[data-structure-load-team="a"] small').textContent,/Tax: 3 .* Accounting: 1/);
    assert.match(summary().textContent,/1 shared .* 1 with no PIC mapped/);
    assert.equal(status(),"Balanced by client count","a 60/40 split is within the threshold");
    editor.refreshClients(clients.filter(client => client.id !== "bOnly"));
    assert.equal(x.host.querySelector(".structure-viewport"),canvas);
    assert.equal(count("b"),"1");
    assert.equal(status(),"Uneven: Team A has more clients");
    editor.refreshClients([]);
    assert.equal(status(),"No clients mapped");
  } finally { x.dom.window.close(); }
});

test("Team C can use the supervisor branch above A and B and forecast its conflicts and load", () => {
  const staff = [...roster,
    {id:"s",display_name:"Incoming Supervisor",role:"supervisor",team_division:"Tax Team"},
    {id:"ct",display_name:"C Tax",role:"staff",team_division:"Tax Team"}
  ];
  const x = setup(staff), print = new JSDOM("<html></html>");
  try {
    const nodes = [
      {id:"3",kind:"Supervisor",label:"Incoming Supervisor",parent:"",pic:"s"},
      {id:"1",kind:"Leader",label:"Branch A",parent:"3",pic:"a"},
      {id:"2",kind:"Leader",label:"Branch B",parent:"3",pic:"b"},
      {id:"4",kind:"Role",label:"C Tax",parent:"3",pic:"ct"}
    ];
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[
      {id:"1",name:"Split baseline",nodes,teamSplit:{a:"1",b:"2",owners:{branchOnly:"1"}}}
    ]}));
    const client = (id:string,taxPicProfileId:string,accountingPicProfileId="") =>
      ({id,name:id,clientStatus:"Active",taxPicProfileId,accountingPicProfileId});
    const clients = [
      client("bothRoles","ct","ct"),client("shared","a","ct"),client("foreign","b"),
      client("branchOnly","a"),client("lead","s"),client("projectedMove","b"),client("noPIC","")
    ];
    const drafts = {shared:{nextAccPic:"Dewa"},foreign:{nextTaxPic:"C Tax"},bothRoles:{nextTaxPic:""},projectedMove:{nextTaxPic:"C Tax"}};
    x.mount("manager",() => true,clients,() => drafts);
    const select = (field:string,value:string) => {
      const input = x.host.querySelector(`[data-structure-split="${field}"]`);
      input.value = value;
      input.dispatchEvent(new x.w.Event("change",{bubbles:true}));
    };
    const tab = (name:string) => x.host.querySelector(`[data-structure-section="${name}"]`).click();
    const row = (key:string) => x.host.querySelector(`[data-structure-confirm-owner="${key}"]`).closest("tr");
    const team = (slot:string) => x.host.querySelector(`[data-structure-load-team="${slot}"]`);
    const counts = () => [...x.host.querySelectorAll("[data-structure-load-count]")].map((node:any) => node.textContent);
    assert.equal(team("c"),null);
    tab("split");
    select("c","1");
    assert.match(x.host.querySelector("[data-structure-status]").textContent,/must use a distinct position/);
    select("c","3");
    assert.deepEqual(x.saved().plans[0].teamSplit.owners,{branchOnly:"1"},"adding Team C preserves existing confirmations");
    assert.deepEqual(counts(),["2","2","3"]);
    assert.match(team("c").textContent,/Team C: Incoming Supervisor/);
    assert.match(team("c").textContent,/1 flagged/);
    assert.equal(row("bothRoles").querySelector("[data-structure-owner]").value,"3","Team C can be suggested");
    assert.match(row("shared").querySelector("[data-structure-split-result]").textContent,/Tax and Accounting split/);
    row("foreign").querySelector("[data-structure-owner]").value = "3";
    row("foreign").querySelector("[data-structure-confirm-owner]").click();
    assert.match(row("foreign").querySelector("[data-structure-split-result]").textContent,/Outside intended team/);
    assert.match(team("c").textContent,/2 flagged/);
    x.click("recommend-pics");
    assert.match(row("foreign").querySelector("[data-structure-recommendation]").textContent,/Future Lead .* C Tax/);

    tab("chart");
    const chart = x.host.querySelector(".structure-viewport");
    const saved = x.saved();
    select("mode","next");
    assert.equal(x.host.querySelector(".structure-viewport"),chart);
    assert.deepEqual(counts(),["2","0","4"]);
    assert.match(team("c").textContent,/Tax: 3 .* Accounting: 1 .* 1 flagged/);
    assert.match(x.host.querySelector("[data-structure-load-status]").textContent,/Uneven: Team C/);
    assert.deepEqual(x.saved(),saved,"changing projection does not save anything");
    tab("split");
    assert.equal(x.host.querySelector('[data-structure-split="mode"]').value,"next");
    assert.match(row("foreign").querySelector("[data-structure-split-result]").textContent,/Within one team/);
    assert.match(row("projectedMove").querySelector("[data-structure-split-result]").textContent,/Projected team change/);
    select("filter","review");
    assert.doesNotMatch(x.host.querySelector(".structure-review tbody").textContent,/projectedMove/);
    x.w.open = () => ({document:print.window.document,focus(){},print(){}});
    x.click("print");
    const doc = print.window.document;
    assert.match(doc.querySelector(".structure-load")!.textContent!,/Forecast team client load/);
    assert.deepEqual([...doc.querySelectorAll("[data-structure-load-count]")].map(node => node.textContent),["2","0","4"]);
    assert.match(doc.querySelector(".structure-print-findings h2")!.textContent!,/Next PICs \(draft forecast\)/);
    assert.match(doc.querySelector(".structure-print-findings tbody")!.textContent!,/projectedMove/);
    assert.equal(doc.querySelector("select"),null);
    select("mode","current");
    assert.deepEqual(counts(),["2","2","3"]);
    tab("chart");
    x.host.querySelector('[data-structure-edit="3"]').click();
    x.click("remove");
    assert.deepEqual(x.saved().plans[0].teamSplit,{a:"1",b:"2",c:"",owners:{branchOnly:"1"}});
    assert.equal(team("c"),null);
  } finally { x.dom.window.close(); print.window.close(); }
});

test("Team Split loads shared drafts separately from personal drafts and refreshes withdrawals",async()=>{
  const x = setup();
  try {
    const nodes = [
      {id:"1",kind:"Leader",label:"Branch A",parent:"",pic:"a"},
      {id:"2",kind:"Leader",label:"Branch B",parent:"",pic:"b"}
    ];
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[{id:"1",name:"Split",nodes}]}));
    const rows = [{id:"local",databaseId:"stable-db-id",name:"One client",clientStatus:"Active",taxPicProfileId:"a"}];
    let calls = 0, version = 1, changes: any[] = [{clientId:"stable-db-id",nextTaxPic:"Previous display name",nextTaxPicId:"b"}];
    const editor = x.mount("manager",()=>true,rows,()=>({local:{nextTaxPic:""}}),async()=>{
      calls++;
      return {year:2026,draft:{version,changes,published_by_name:"Supervisor"}};
    });
    const mode = (value:string) => {const select=x.host.querySelector('[data-structure-split="mode"]'); select.value=value; select.dispatchEvent(new x.w.Event("change",{bubbles:true}));};
    const counts = () => [...x.host.querySelectorAll("[data-structure-load-count]")].map((node:any)=>node.textContent);
    assert.deepEqual(counts(),["1","0"]); assert.equal(calls,0);
    mode("next"); assert.deepEqual(counts(),["0","0"]); assert.equal(calls,0);
    mode("shared"); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(counts(),["0","1"]);
    assert.match(x.host.querySelector("[data-structure-load]").textContent,/Shared 2026 draft.*v1.*Supervisor/s);
    version++; changes=[];
    editor.refreshSharedForecast();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(counts(),[]);
    assert.match(x.host.querySelector("[data-structure-load]").textContent,/No shared Next PIC draft for 2026/);
    mode("current"); assert.deepEqual(counts(),["1","0"]);
  } finally { x.dom.window.close(); }
});

test("Team Split column filters search, combine checklists, and remain available when no rows match", () => {
  const x = setup(), print = new JSDOM("<html></html>");
  try {
    const nodes = [
      {id:"1",kind:"Leader",label:"Branch A",parent:"",pic:"a"},
      {id:"2",kind:"Leader",label:"Branch B",parent:"",pic:"b"}
    ];
    const split = {a:"1",b:"2",owners:{wrong:"1"}};
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[
      {id:"1",name:"Split baseline",nodes,teamSplit:split}
    ]}));
    const client = (id:string,name:string,clientCode:string,taxPicProfileId:string,accountingPicProfileId="") =>
      ({id,name,clientCode,clientStatus:"Active",taxPicProfileId,accountingPicProfileId});
    x.mount("manager",() => true,[
      client("a1","North","CL-001","a","a"),client("a2","North","CL-002","a","b"),
      client("b1","East","CL-003","b","b"),client("u1","Unassigned","CL-004",""),
      client("wrong","West","CL-005","b","b")
    ],() => ({a2:{nextAccPic:"Dewa"}}));
    x.host.querySelector('[data-structure-section="split"]').click();
    const trigger = (column:string) => x.host.querySelector(`[data-structure-column="${column}"]`);
    const menu = () => x.host.querySelector(".structure-column-menu");
    const all = () => menu().querySelector("[data-column-all]");
    const apply = () => menu().querySelector('button[type="submit"]').click();
    const shown = () => [...x.host.querySelectorAll("[data-structure-confirm-owner]")]
      .map((button:any) => button.dataset.structureConfirmOwner).sort();
    const value = (label:string) => [...menu().querySelectorAll("[data-column-option]")].find((item:any) =>
      item.querySelector("span").textContent === label) as any;
    const search = (query:string) => {
      const input = menu().querySelector("[data-column-query]");
      input.value = query;
      input.dispatchEvent(new x.w.Event("input",{bubbles:true}));
    };
    const scope = (key:string,next:string) => {
      const input = x.host.querySelector(`[data-structure-split="${key}"]`);
      input.value = next;
      input.dispatchEvent(new x.w.Event("change",{bubbles:true}));
    };

    assert.equal(x.host.querySelectorAll("thead [data-structure-column]").length,5);
    trigger("client").click();
    assert.equal(trigger("client").getAttribute("aria-expanded"),"true");
    assert.equal(x.w.document.activeElement,menu().querySelector("[data-column-query]"));
    all().click();
    search("CL-002");
    assert.ok(value("North / CL-001").hidden);
    assert.equal(value("North / CL-002").hidden,false);
    all().click();
    assert.deepEqual(shown(),["a1","a2","b1","u1","wrong"],"options only apply when confirmed");
    apply();
    assert.deepEqual(shown(),["a2"],"same-name clients can be filtered separately by code");
    assert.ok(trigger("client").classList.contains("is-filtered"));
    assert.equal(x.w.document.activeElement,trigger("client"));
    trigger("client").click();
    menu().querySelector("[data-column-clear]").click();
    assert.equal(trigger("client").classList.contains("is-filtered"),false);

    trigger("team").click();
    assert.ok(value("No confirmed team"));
    assert.ok(value("Team A: Dewa"),"confirmed and suggested teams are available");
    search("not a team");
    assert.equal(all().disabled,true);
    menu().dispatchEvent(new x.w.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    assert.equal(menu(),null);
    assert.equal(x.w.document.activeElement,trigger("team"));

    trigger("tax").click();
    value("Unassigned").querySelector("input").click();
    assert.equal(all().indeterminate,true);
    apply();
    assert.deepEqual(shown(),["a1","a2","b1","wrong"],"checked PIC values are alternatives");
    trigger("accounting").click();
    all().click();
    value("Future Lead").querySelector("input").click();
    apply();
    assert.deepEqual(shown(),["a2","b1","wrong"],"different columns are combined");
    trigger("finding").click();
    all().click();
    value("Tax and Accounting split").querySelector("input").click();
    apply();
    assert.deepEqual(shown(),["a2"]);
    scope("mode","next");
    assert.deepEqual(shown(),[]);
    assert.match(x.host.querySelector("tbody").textContent,/No clients match these filters/);
    assert.ok(trigger("accounting"),"headers remain usable with zero results");
    scope("mode","current");
    assert.deepEqual(shown(),["a2"]);

    scope("filter","review");
    assert.deepEqual(shown(),[]);
    x.w.open = () => ({document:print.window.document,focus(){},print(){}});
    x.click("print");
    assert.equal(print.window.document.querySelectorAll(".structure-print-findings tbody tr").length,2,"printing ignores column filters");
    x.click("clear-column-filters");
    assert.deepEqual(shown(),["u1"],"clearing columns keeps the Show filter");
    trigger("finding").click();
    x.host.querySelector(".structure-review-head").dispatchEvent(new x.w.Event("pointerdown",{bubbles:true}));
    assert.equal(menu(),null);
    assert.deepEqual(x.saved().plans[0].teamSplit,split,"filters never change saved plans");
  } finally { x.dom.window.close(); print.window.close(); }
});

test("the Current split report prints the chart followed by all saved PIC conflicts regardless of filters", () => {
  const x = setup(), print = new JSDOM("<html></html>");
  try {
    const nodes = [
      {id:"1",kind:"Leader",label:"Branch A",parent:"",pic:"a"},
      {id:"2",kind:"Leader",label:"Branch B",parent:"",pic:"b"},
      {id:"3",kind:"Role",label:"Future role",parent:"1",pic:""}
    ];
    const owners = {wrong:"1",aligned:"1",inactive:"1"};
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[
      {id:"1",name:"Split baseline",nodes,teamSplit:{a:"1",b:"2",owners}}
    ]}));
    const client = (id:string,name:string,taxPicProfileId:string,accountingPicProfileId="",clientStatus="Active") =>
      ({id,name,clientCode:`CL-${id}`,clientStatus,taxPicProfileId,accountingPicProfileId});
    const clients = [
      client("wrong","Wrong intended team","b","b"),
      client("cross","<Cross team>","a","b"),
      client("aligned","Next-only conflict","a"),
      client("inactive","Inactive row","b","","Inactive"),
      client("missing","Unmapped only","unknown")
    ];
    const drafts = {wrong:{nextTaxPic:"Dewa",nextAccPic:"Dewa"},aligned:{nextTaxPic:"Future Lead"}};
    const editor = x.mount("manager",() => true,clients,() => drafts);
    const disclosure = x.host.querySelector(".structure-load-disclosure");
    assert.equal(disclosure.open,true);
    disclosure.querySelector("summary").click();
    assert.equal(disclosure.open,false);
    x.host.querySelector('[data-structure-section="split"]').click();
    assert.equal(x.host.querySelector(".structure-load-disclosure").open,false);
    const select = (field:string,value:string) => {
      const control = x.host.querySelector(`[data-structure-split="${field}"]`);
      control.value = value;
      control.dispatchEvent(new x.w.Event("change",{bubbles:true}));
    };
    select("filter","review");
    assert.doesNotMatch(x.host.querySelector(".structure-review tbody").textContent,/Wrong intended team/);
    let printed = false;
    x.w.open = () => ({document:print.window.document,focus(){},print(){printed = true;}});
    assert.equal(x.host.querySelectorAll('[data-structure-action^="print"]').length,1);
    x.click("print");
    assert.ok(printed);
    const doc = print.window.document;
    assert.ok(doc.body.classList.contains("structure-print-report"));
    const summary = doc.body.children[0].querySelector(".structure-load")!;
    assert.match(summary.textContent!,/Current team client load/);
    assert.deepEqual([...summary.querySelectorAll("[data-structure-load-count]")].map(count => count.textContent),["2","2"]);
    assert.match(summary.textContent!,/1 shared .* 1 with no PIC mapped/);
    assert.match(summary.textContent!,/Balanced by client count/);
    assert.equal(doc.body.children[0].querySelectorAll(".structure-wires path").length,1);
    assert.ok(doc.body.children[1].classList.contains("structure-print-findings"));
    assert.equal(doc.querySelectorAll(".structure-print-findings tbody tr").length,2);
    assert.match(doc.body.textContent!,/2 of 4 active clients flagged/);
    assert.match(doc.body.textContent!,/<Cross team>/);
    assert.match(doc.body.textContent!,/Wrong intended team/);
    assert.match(doc.body.textContent!,/PIC outside intended team/);
    assert.match(doc.body.textContent!,/Tax and Accounting split/);
    assert.doesNotMatch(doc.body.textContent!,/Next-only conflict|Inactive row|Unmapped only/);
    assert.equal(doc.querySelector("button, select, img"),null);
    assert.match(doc.querySelector("style")!.textContent!,/break-after:page/);
    assert.match(doc.querySelector("style")!.textContent!,/display:table-header-group/);
    assert.deepEqual(drafts,{wrong:{nextTaxPic:"Dewa",nextAccPic:"Dewa"},aligned:{nextTaxPic:"Future Lead"}});
    editor.refreshClients([clients[2]]);
    const empty = new JSDOM("<html></html>");
    try {
      x.host.querySelector('[data-structure-section="chart"]').click();
      assert.equal(x.host.querySelectorAll('[data-structure-action^="print"]').length,1);
      x.w.open = () => ({document:empty.window.document,focus(){},print(){}});
      x.click("print");
      assert.match(empty.window.document.body.textContent!,/No current client conflicts/);
    } finally { empty.window.close(); }
  } finally { x.dom.window.close(); print.window.close(); }
});

test("printing outputs only the chosen scenario; removing a parent keeps its reports", () => {
  const x = setup(), print = new JSDOM("<html></html>");
  try {
    x.mount();
    x.submit({label:"Partner <img src=x onerror=alert(1)>", pic:"a"});
    x.submit({label:"Accounting Team", kind:"Team", parent:"1"});
    assert.equal(x.host.querySelector("img"),null);
    let printed = false;
    x.w.open = () => ({document:print.window.document,focus(){},print(){printed = true;}});
    x.click("print");
    assert.ok(printed);
    assert.equal(print.window.document.querySelectorAll(".structure-print-page").length,1);
    assert.equal(print.window.document.querySelector(".structure-print-findings"),null);
    assert.match(print.window.document.body.textContent!,/Accounting Team/);
    assert.equal(print.window.document.querySelectorAll(".structure-wires path").length,1);
    assert.equal(print.window.document.querySelector("button, img, form"),null);
    x.host.querySelector('[data-structure-edit="1"]').click();
    x.click("remove");
    assert.deepEqual(x.saved().plans[0].nodes.map((node:any) => [node.label,node.parent]),[["Accounting Team",""]]);
  } finally { x.dom.window.close(); print.window.close(); }
});

test("zoom controls resize the canvas without rebuilding cards or changing the saved scenario", () => {
  const x = setup();
  try {
    x.mount();
    x.submit({label:"Managing Partner", pic:"a"});
    x.submit({label:"Tax Team", kind:"Team", parent:"1", pic:"b"});
    const original = x.saved();
    const zoom = (action:string) => x.host.querySelector(`[data-structure-zoom="${action}"]`);
    const stage = x.host.querySelector(".structure-stage"), graph = stage.firstElementChild;
    const viewport = stage.parentElement;
    Object.defineProperties(viewport,{clientWidth:{value:180},clientHeight:{value:450}});
    Object.defineProperty(stage,"offsetTop",{value:40});
    zoom("in").click();
    assert.equal(zoom("reset").textContent,"125%");
    assert.equal(graph.style.transform,"scale(1.25)");
    assert.equal(parseInt(stage.style.width),Math.ceil(Number(graph.dataset.width)*1.25));
    zoom("out").click();
    assert.equal(zoom("reset").textContent,"100%");
    zoom("fit").click();
    assert.equal(zoom("reset").textContent,"78%");
    assert.equal(viewport.scrollLeft,0);
    zoom("reset").click();
    assert.equal(x.host.querySelector(".structure-stage").firstElementChild,graph);
    assert.equal(graph.style.transform,"scale(1)");
    assert.deepEqual(x.saved(),original);
  } finally { x.dom.window.close(); }
});

test("a wide and deep off-screen chart prints once, sized to the paper, with every card and connector", () => {
  const x = setup(), print = new JSDOM("<html></html>");
  try {
    const nodes = Array.from({length:18},(_,index) => ({ id:String(index+1), label:`Position ${index+1}`,
      kind:"Role", parent:index===0 ? "" : index < 14 ? "1" : String(index), pic:"", picName:"" }));
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[{id:"1",name:"Wide Plan",nodes}]}));
    x.mount();
    x.host.querySelector('[data-structure-zoom="out"]').click();
    x.host.querySelector(".structure-viewport").scrollLeft = 2000;
    const graph = x.host.querySelector(".structure-flow");
    x.w.open = () => ({document:print.window.document,focus(){},print(){}});
    x.click("print");
    const doc = print.window.document, svg = doc.querySelector(".structure-print-diagram")!;
    assert.equal(doc.querySelectorAll(".structure-print-page").length,1);
    assert.equal(svg.getAttribute("viewBox"),`0 0 ${graph.dataset.width} ${graph.dataset.height}`);
    assert.equal(svg.getAttribute("preserveAspectRatio"),"xMidYMid meet");
    assert.ok(Number(graph.dataset.width) > 2000);
    assert.ok(Number(graph.dataset.height) > 700);
    assert.match(doc.querySelector("style")!.textContent!,/@page\{size:landscape;/);
    assert.match(doc.querySelector("style")!.textContent!,/@media print\{\.structure-print-page\{inset:0\}\}/);
    assert.match(doc.querySelector("style")!.textContent!,/\.structure-print-diagram\{display:block;width:100%;height:100%\}/);
    assert.equal(doc.querySelector(".structure-tree, button, form"),null);
    const cards = [...svg.querySelectorAll(".structure-print-card")];
    assert.equal(cards.length,nodes.length);
    assert.deepEqual([...svg.querySelectorAll(".structure-wires path")].map(path => path.getAttribute("d")),
      [...graph.querySelectorAll(".structure-wires path")].map(path => path.getAttribute("d")));
    for (const [i,card] of cards.entries()) {
      const screen = graph.querySelector(`[data-structure-node="${nodes[i].id}"]`);
      const x = parseFloat(screen.style.left), y = parseFloat(screen.style.top);
      assert.equal(card.getAttribute("transform"),`translate(${x},${y})`);
      assert.ok(x >= 0 && y >= 0 && x+176 <= Number(graph.dataset.width) && y+84 <= Number(graph.dataset.height));
    }
  } finally { x.dom.window.close(); print.window.close(); }
});

test("Structure Lab reopens saved scenarios and connects live PICs and existing branches", () => {
  const x = setup();
  try {
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[{id:"1",name:"Saved company plan",nodes:[
      {id:"1",label:"Planning Team",kind:"Team",parent:"",pic:"",picName:""},
      {id:"2",label:"Analyst",kind:"Role",parent:"1",pic:"",picName:""}
    ]}]}));
    x.mount();
    const pick = (id:string) => x.host.querySelector(`[data-structure-pic="${id}"]`);
    const edit = (id:string) => x.host.querySelector(`[data-structure-edit="${id}"]`);
    const emit = (at:any,type:string,xValue:number) => {
      const event = new x.w.MouseEvent(type,{bubbles:true,clientX:xValue,clientY:10,button:0});
      Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true}});
      at.dispatchEvent(event);
    };
    const move = (source:any,target:any) => {
      x.w.document.elementFromPoint = () => target;
      emit(source,"pointerdown",0);
      emit(x.w.window,"pointermove",30);
      emit(x.w.window,"pointerup",30);
    };
    assert.match(x.host.querySelector(".structure-chart").textContent,/Saved company plan/);
    assert.equal(pick("c"),null);
    assert.match(pick("a").textContent,/Dewa.*Partner/);
    move(pick("a"),x.host.querySelector("[data-structure-top]"));
    assert.equal(pick("a"),null);
    assert.deepEqual(x.saved().plans[0].nodes[2],{id:"3",parent:"",pic:"a",picName:"Dewa",label:"Managing Partner",kind:"Partner"});
    move(x.host.querySelector('[data-structure-move="1"]'),edit("3"));
    assert.match(edit("1").getAttribute("aria-label"),/reports to Dewa/);
    assert.match(edit("2").getAttribute("aria-label"),/reports to Planning Team/);
    move(x.host.querySelector('[data-structure-move="3"]'),edit("2"));
    assert.equal(x.saved().plans[0].nodes[2].parent,"");
    assert.match(x.host.querySelector("[data-structure-status]").textContent,/cannot loop/);
    pick("b").click();
    edit("1").click();
    assert.match(edit("4").getAttribute("aria-label"),/Future Lead, Leader, reports to Planning Team/);
    assert.equal(pick("b"),null);
    assert.equal(x.host.querySelectorAll(".structure-wires path").length,3);
  } finally { x.dom.window.close(); }
});

test("planning is role-gated and browser storage is account-scoped", () => {
  const x = setup();
  try {
    x.mount("manager",() => false);
    assert.equal(x.host.querySelector("form"),null);
    x.mount();
    x.submit({label:"Private scenario node"});
    x.mount("another-account");
    assert.doesNotMatch(x.host.textContent,/Private scenario node/);
    assert.equal(x.w.localStorage.getItem("tax-dashboard:structure:v1:another-account"),null);
  } finally { x.dom.window.close(); }
});
