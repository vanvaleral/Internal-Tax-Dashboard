import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../public/structure-flowchart-mockup.${file}`, import.meta.url), "utf8");
function open() {
  const dom = new JSDOM(read("html"), {runScripts:"outside-only"});
  const w = dom.window as any;
  w.eval(read("js"));
  const get = (id: string) => w.document.getElementById(id);
  const card = (id: string, action = ".card-main") => w.document.querySelector(`[data-id="${id}"] ${action}`);
  return {dom,w,get,card};
}

test("dragging reconnects a branch and rejecting a loop preserves the reporting lines", () => {
  const {dom,w,card,get} = open();
  try {
    const emit = (at: any, type: string, x: number) => {
      const event = new w.MouseEvent(type, {bubbles:true, clientX:x, clientY:10, button:0});
      Object.defineProperties(event,{pointerId:{value:1},isPrimary:{value:true}});
      at.dispatchEvent(event);
    };
    const move = (source: string, target: string) => {
      w.document.elementFromPoint = () => card(target);
      emit(card(source,".grip"),"pointerdown",0);
      emit(w.document,"pointermove",24);
      emit(w.document,"pointerup",24);
    };
    move("2","3");
    assert.match(card("2").getAttribute("aria-label"),/reports to Bima/);
    assert.match(card("4").getAttribute("aria-label"),/reports to Nadia/);
    assert.equal(get("links").querySelectorAll("path").length,6);
    move("3","4");
    assert.match(card("3").getAttribute("aria-label"),/reports to Dewa/);
    assert.match(get("status").textContent,/No change/);
  } finally { dom.window.close(); }
});

test("click-to-connect, creating future positions and printing use the same editable draft", () => {
  const {dom,w,card,get} = open();
  try {
    card("4",".grip").click();
    card("3").click();
    assert.match(card("4").getAttribute("aria-label"),/reports to Bima/);
    get("add").click();
    get("person").value = "Future Partner";
    get("position").value = "New practice lead";
    get("kind").value = "partner";
    get("editor").requestSubmit();
    assert.match(card("8").getAttribute("aria-label"),/Future Partner.*top level/);
    let printed = false;
    w.print = () => { printed = true; };
    get("print").click();
    assert.equal(printed,true);
  } finally { dom.window.close(); }
});

test("active PICs can be dragged onto a manager or placed at the top level without duplicate cards", () => {
  const {dom,w,card,get} = open();
  try {
    const pick = (id: string) => get("pic-roster").querySelector(`[data-pic="${id}"]`);
    const emit = (at: any, type: string, x: number) => {
      const event = new w.MouseEvent(type, {bubbles:true, clientX:x, clientY:10, button:0});
      Object.defineProperties(event,{pointerId:{value:7},isPrimary:{value:true}});
      at.dispatchEvent(event);
    };
    assert.equal(pick("pic-archived"),null);
    assert.equal(pick("pic-1"),null);
    w.document.elementFromPoint = () => card("3");
    emit(pick("pic-sari"),"pointerdown",0);
    emit(w.document,"pointermove",25);
    emit(w.document,"pointerup",25);
    assert.match(card("8").getAttribute("aria-label"),/Sari, Associate, reports to Bima/);
    assert.equal(pick("pic-sari"),null);
    pick("pic-arman").click();
    get("top-level").click();
    assert.match(card("9").getAttribute("aria-label"),/Arman, Partner, top level/);
    assert.equal(pick("pic-arman"),null);
    w.confirm = () => true;
    get("remove").click();
    assert.ok(pick("pic-arman"));
  } finally { dom.window.close(); }
});
