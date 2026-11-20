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
  const mount = (account = "manager", canManage = () => true, clients: any[] | null = null) => {
    const editor = w.ManagementStructure.create({account, canManage, safeHtml: (html:string) => w.DOMPurify.sanitize(html,{USE_PROFILES:{html:true,svg:true}})});
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

test("client conflicts compare the selected chart by PIC ID and matching reporting level", () => {
  const staff = [
    ...roster,
    {id:"partner-2",display_name:"Ayu",role:"partner"},
    {id:"supervisor-1",display_name:"Sam",role:"supervisor"},
    {id:"supervisor-2",display_name:"Mira",role:"supervisor"},
    {id:"leader-2",display_name:"Rina",role:"leader"},
    {id:"tax",display_name:"Adi",role:"staff"},
    {id:"acc",display_name:"Beni",role:"staff"},
    {id:"dup-1",display_name:"Twin",role:"staff"},
    {id:"dup-2",display_name:"Twin",role:"staff"}
  ];
  const x = setup(staff);
  try {
    const node = (id:string,kind:string,pic:string,parent="",label=pic) => ({id,kind,pic,parent,label,picName:label});
    const nodes = [
      node("1","Partner","","","Dewa"), // Legacy, manually named partner card.
      node("2","Partner","partner-2"),
      node("3","Role","supervisor-1","1"),
      node("4","Role","supervisor-2","2"),
      node("5","Role","b","3"),
      node("6","Leader","leader-2","3"),
      node("7","Role","tax","6"),
      node("8","Role","acc","4")
    ];
    const moved = nodes.map(row => row.id === "7" ? {...row,parent:"5"} : row);
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[
      {id:"1",name:"Current plan",nodes},{id:"2",name:"Move to Future Lead",nodes:moved}
    ]}));
    const make = (id:string,extra:any) => ({id,name:id,clientStatus:"Active",...extra});
    const clients = [
      make("Cross partner", {taxPicProfileId:"tax",taxPic:"Wrong stale name",partnerProfileId:"partner-2",supervisorProfileId:"supervisor-1",accountingPicProfileId:"acc"}),
      make("Cross leader", {taxPic:" ADI ",partner:"dewa",supervisorProfileId:"b"}),
      make("Shared supervisor", {taxPicProfileId:"tax",partnerProfileId:"a",supervisorProfileId:"supervisor-1"}),
      make("Leader owns own work", {taxPicProfileId:"leader-2",supervisorProfileId:"leader-2"}),
      make("Ambiguous PIC", {taxPic:"Twin",partnerProfileId:"a"}),
      make("Missing ownership", {taxPicProfileId:"tax"}),
      make("Archived client", {taxPicProfileId:"tax",partnerProfileId:"partner-2",clientStatus:"Inactive"}),
      make("Unassigned", {partnerProfileId:"partner-2"})
    ];
    const editor = x.mount("manager",() => true,clients);
    const open = (section:string) => x.host.querySelector(`[data-structure-section="${section}"]`).click();
    const select = (selector:string,value:string) => {
      const control = x.host.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new x.w.Event("change",{bubbles:true}));
    };
    const names = () => [...x.host.querySelectorAll(".structure-review tbody th")].map(row => (row as HTMLElement).textContent?.trim());
    const setFilter = (value:string) => select("[data-structure-review-filter]",value);
    open("conflicts");
    assert.deepEqual(names(),["Cross leader","Cross partner","Cross partner"]);
    assert.match(x.host.querySelector(".structure-review-summary").textContent,/2 clients with conflicts/);
    assert.match(x.host.querySelector(".structure-review tbody").textContent,/Adi/);
    assert.doesNotMatch(x.host.querySelector(".structure-review tbody").textContent,/Wrong stale name/);
    setFilter("partner");
    assert.deepEqual(names(),["Cross partner"]);
    setFilter("leadership");
    assert.deepEqual(names(),["Cross leader","Cross partner"]);
    select("[data-structure-plan]","2");
    assert.deepEqual(names(),["Cross partner"]);
    setFilter("review");
    assert.deepEqual(names(),["Ambiguous PIC","Missing ownership"]);
    setFilter("conflicts");
    editor.refreshClients(clients.filter(row => row.id !== "Cross partner"));
    assert.deepEqual(names(),[]);
    open("chart");
    assert.ok(x.host.querySelector(".structure-flow"));
    assert.deepEqual(x.saved().plans[0].nodes,nodes);
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
