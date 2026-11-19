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

function setup() {
  const dom = new JSDOM("<section data-structure-host></section>",{url:"https://test.local/demo.html", runScripts:"outside-only"});
  const w = dom.window as any, host = w.document.querySelector("section");
  w.structuredClone = structuredClone;
  w.confirm = () => true;
  w.eval(read("vendor/purify.min.js"));
  w.eval(read("management-structure.js"));
  const mount = (account = "manager", canManage = () => true) => {
    const editor = w.ManagementStructure.create({account, canManage, safeHtml: (html:string) => w.DOMPurify.sanitize(html,{USE_PROFILES:{html:true,svg:true}})});
    editor.mount(host, roster);
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

test("a large off-screen chart prints as overlapping pages, with every full card covered", () => {
  const x = setup(), print = new JSDOM("<html></html>");
  try {
    const nodes = Array.from({length:18},(_,index) => ({ id:String(index+1), label:`Position ${index+1}`,
      kind:"Role", parent:index===0 ? "" : index < 14 ? "1" : String(index), pic:"", picName:"" }));
    x.w.localStorage.setItem("tax-dashboard:structure:v1:manager",JSON.stringify({active:"1",plans:[{id:"1",name:"Wide Plan",nodes}]}));
    x.mount();
    x.host.querySelector('[data-structure-zoom="out"]').click();
    x.host.querySelector(".structure-viewport").scrollLeft = 2000;
    x.w.open = () => ({document:print.window.document,focus(){},print(){}});
    x.click("print");
    const doc = print.window.document, tiles = [...doc.querySelectorAll<HTMLElement>(".structure-print-tile")];
    assert.ok(tiles.length > 1);
    assert.match(doc.body.textContent!,/row 2, column 1/);
    assert.equal(doc.querySelector(".structure-tree, button, form"),null);
    const first = tiles[0].querySelectorAll<HTMLElement>(".structure-card");
    assert.equal(first.length,nodes.length);
    assert.equal(tiles[0].querySelectorAll(".structure-wires path").length,nodes.length-1);
    for (const card of first) {
      assert.ok(tiles.some(tile => {
        const slice = tile.firstElementChild as HTMLElement;
        const scale = Number(slice.style.getPropertyValue("--structure-print-scale"));
        const x = parseFloat(slice.style.left) + parseFloat(card.style.left)*scale;
        const y = parseFloat(slice.style.top) + parseFloat(card.style.top)*scale;
        return x >= 0 && y >= 0 && x+176*scale <= parseFloat(tile.style.width) && y+84*scale <= parseFloat(tile.style.height);
      }),`all of ${card.textContent} should appear on at least one sheet`);
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
