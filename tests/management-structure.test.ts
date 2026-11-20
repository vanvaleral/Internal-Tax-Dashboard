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
  const mount = (account = "manager", canManage = () => true, clients: any[] | null = null, getAllocationDrafts = () => ({})) => {
    const editor = w.ManagementStructure.create({account, canManage, getAllocationDrafts, safeHtml: (html:string) => w.DOMPurify.sanitize(html,{USE_PROFILES:{html:true,svg:true}})});
    editor.mount(host, staff, clients);
    return editor;
  };
  const click = (action:string) => host.querySelector(`[data-structure-action="${action}"]`).click();
  const submit = (fields:Record<string,string>, type = "node") => {
    const form = host.querySelector(`[data-structure-form="${type}"]`);
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
    assert.deepEqual(x.saved().plans[0].teamSplit,{a:"1",b:"",owners:{}});
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

test("a manager can chart new partners and teams, save PIC links and independently duplicate a scenario", () => {
  const x = setup();
  try {
    x.mount();
    assert.doesNotMatch(x.host.textContent,/Archived PIC/);
    x.submit({label:"Managing Partner", pic:"a"});
    x.submit({label:"Tax Team", kind:"Team", parent:"1", pic:"b"});
    assert.equal(x.host.querySelectorAll(".structure-wires path").length,1);
    assert.match(x.host.querySelector(".structure-chart").textContent,/Dewa/);
    x.click("copy");
    x.submit({scenarioTitle:"New Partner Proposal"},"name");
    x.host.querySelector('[data-structure-edit="1"]').click();
    assert.equal(x.host.querySelector('[name="parent"] option[value="2"]'),null,"can't report to a descendant");
    x.submit({label:"Incoming Partner",pic:""});
    assert.equal(x.saved().plans[0].nodes[0].label,"Managing Partner");
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

test("the split report prints the chart followed by all Current PIC conflicts, regardless of Next mode and filters", () => {
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
    x.host.querySelector('[data-structure-section="split"]').click();
    const select = (field:string,value:string) => {
      const control = x.host.querySelector(`[data-structure-split="${field}"]`);
      control.value = value;
      control.dispatchEvent(new x.w.Event("change",{bubbles:true}));
    };
    select("mode","next");
    select("filter","review");
    assert.doesNotMatch(x.host.querySelector(".structure-review tbody").textContent,/Wrong intended team/);
    let printed = false;
    x.w.open = () => ({document:print.window.document,focus(){},print(){printed = true;}});
    assert.equal(x.host.querySelectorAll('[data-structure-action^="print"]').length,1);
    x.click("print");
    assert.ok(printed);
    const doc = print.window.document;
    assert.ok(doc.body.classList.contains("structure-print-report"));
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
