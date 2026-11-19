import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8");
const roster = [
  {id:"a", display_name:"Dewa"},
  {id:"b", display_name:"Future Lead"},
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
    const editor = w.ManagementStructure.create({account, canManage, safeHtml: (html:string) => w.DOMPurify.sanitize(html,{USE_PROFILES:{html:true}})});
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
    assert.equal(x.host.querySelectorAll(".structure-tree .structure-tree .structure-node").length,1);
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
    assert.match(print.window.document.body.textContent!,/Accounting Team/);
    assert.equal(print.window.document.querySelector("button, img, form"),null);
    x.host.querySelector('[data-structure-edit="1"]').click();
    x.click("remove");
    assert.deepEqual(x.saved().plans[0].nodes.map((node:any) => [node.label,node.parent]),[["Accounting Team",""]]);
  } finally { x.dom.window.close(); print.window.close(); }
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
