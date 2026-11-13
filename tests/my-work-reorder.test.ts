import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
const read=(file:string)=>readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const markup=(id:string)=>`<div class="my-work-row" data-select-my-work="${id}" data-my-work-reorder-row tabindex="0" role="button"><input type="checkbox"><div><strong>Task ${id}</strong></div><button>Star</button></div>`;

function fixture(reduced=false){
  const dom=new JSDOM(`<main id="my-work-view"><div class="my-work-task-list"><div class="my-work-sort-group" data-my-work-sort-group="active">${["a","b","c"].map(markup).join("")}</div><button class="my-work-section-toggle">Completed</button><div class="my-work-sort-group" data-my-work-sort-group="completed:2026-11">${["d","e"].map(markup).join("")}</div></div></main>`,{runScripts:"outside-only"}),w=dom.window as any;
  let clock=0,sequence=0,animations=0,clicks=0;
  const timers=new Map<number,{at:number;fn:()=>void}>(),frames=new Map<number,()=>void>();
  w.Date.now=()=>clock;w.setTimeout=(fn:()=>void,ms:number)=>{const id=++sequence;timers.set(id,{at:clock+ms,fn});return id;};w.clearTimeout=(id:number)=>timers.delete(id);
  w.requestAnimationFrame=(fn:()=>void)=>{const id=++sequence;frames.set(id,fn);return id;};w.cancelAnimationFrame=(id:number)=>frames.delete(id);
  w.matchMedia=()=>({matches:reduced});
  w.HTMLElement.prototype.animate=function(){animations++;return {cancel(){}};};
  const root=w.document.getElementById("my-work-view"),list=root.querySelector(".my-work-task-list"),active=root.querySelector('[data-my-work-sort-group="active"]');
  const visible=(group:any)=>[...group.children].filter((node:any)=>!node.hidden&&(node.matches(".my-work-row")||node.matches(".my-work-drop-gap")));
  let scroll=0;
  Object.defineProperty(list,"scrollTop",{get:()=>scroll,set:value=>{scroll=Math.max(0,Math.min(200,value));}});
  Object.defineProperty(w.HTMLElement.prototype,"offsetTop",{configurable:true,get(){return Math.max(0,visible((this as any).parentElement).indexOf(this))*56;}});
  Object.defineProperty(w.HTMLElement.prototype,"offsetHeight",{configurable:true,get(){return 50;}});
  w.HTMLElement.prototype.getBoundingClientRect=function(){
    const node=this as any,isList=node===list,isGroup=node.matches("[data-my-work-sort-group]"),group=isGroup?node:node.parentElement;
    const base=group===active?100:100+visible(active).length*56+36;
    const top=isList?100:base-scroll+(isGroup?0:node.offsetTop),height=isList?300:isGroup?visible(node).length*56:50;
    return {left:20,right:620,top,bottom:top+height,width:600,height};
  };
  w.eval(read("public/my-work-reorder.js"));
  const writes:any[]=[],groups:any={active:["a","b","c"],"completed:2026-11":["d","e"]};
  w.MyWorkReorder.mount(root,{groups,onReorder(key:string,ids:string[]){groups[key]=ids;writes.push({key,ids:Array.from(ids)});}});
  root.addEventListener("click",()=>clicks++);
  const row=(id:string)=>root.querySelector(`[data-select-my-work="${id}"]`);
  const pointer=(type:string,node:any,y=125,extra:any={})=>{
    const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:60,clientY:y});
    for(const [key,value] of Object.entries({pointerId:7,pointerType:"mouse",isPrimary:true,...extra}))Object.defineProperty(event,key,{value});
    node.dispatchEvent(event);return event;
  };
  const touch=(type:string,node:any,y=125)=>{
    const event=new w.Event(type,{bubbles:true,cancelable:true}),point={identifier:9,clientX:60,clientY:y};
    Object.defineProperty(event,"touches",{value:type==="touchend"?[]:[point]});Object.defineProperty(event,"changedTouches",{value:[point]});node.dispatchEvent(event);return event;
  };
  const advance=(ms:number)=>{clock+=ms;for(const [id,timer] of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}};
  const frame=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
  const ids=(key="active")=>[...root.querySelector(`[data-my-work-sort-group="${key}"]`).children].filter((node:any)=>node.matches("[data-select-my-work]")).map((node:any)=>node.dataset.selectMyWork);
  return {dom,w,root,list,row,pointer,touch,advance,frame,ids,writes,groups,frames,animations:()=>animations,clicks:()=>clicks};
}

test("a full one-second hold lifts only the selected task, moves a gap, and drops without selecting it",()=>{
  const d=fixture();try{
    d.pointer("pointerdown",d.row("a").querySelector("strong"));d.advance(999);
    assert.equal(d.w.document.querySelector(".my-work-drag-preview"),null);assert.equal(d.row("a").hidden,false);
    d.advance(1);assert.ok(d.w.document.querySelector(".my-work-drag-preview"));assert.equal(d.row("a").hidden,true);
    assert.ok(d.list.classList.contains("is-reordering"));assert.ok(d.w.document.body.classList.contains("my-work-reordering"));
    assert.equal(d.w.document.querySelectorAll("[data-select-my-work=a]").length,1,"floating preview is not a second actionable task");
    d.pointer("pointermove",d.w.document,245);d.frame();assert.ok(d.animations()>0,"peer rows move into the opening");
    d.pointer("pointerup",d.w.document,245);
    assert.deepEqual(d.ids(),["b","c","a"]);assert.deepEqual(d.writes,[{key:"active",ids:["b","c","a"]}]);
    assert.equal(d.row("a").hidden,false);assert.equal(d.list.classList.contains("is-reordering"),false);assert.equal(d.w.document.querySelectorAll(".my-work-drop-gap,.my-work-drag-preview").length,0);
    d.row("a").click();assert.equal(d.clicks(),0,"the release click cannot open the drawer");
    d.advance(601);d.row("a").click();assert.equal(d.clicks(),1,"ordinary clicks work afterwards");
    assert.match(d.root.querySelector('[role="status"]').textContent,/position 3 of 3/);
  }finally{d.dom.window.close();}
});

test("short clicks and completion/favorite controls never start a drag; moving early preserves native scrolling",()=>{
  const d=fixture();try{
    d.pointer("pointerdown",d.row("a"));d.advance(999);d.pointer("pointerup",d.row("a"));d.row("a").click();d.advance(1000);
    assert.equal(d.clicks(),1);assert.equal(d.w.document.querySelector(".my-work-drag-preview"),null);
    for(const target of [d.row("a").querySelector("input"),d.row("a").querySelector("button")]){d.pointer("pointerdown",target);d.advance(1000);assert.equal(d.w.document.querySelector(".my-work-drag-preview"),null);}
    d.touch("touchstart",d.row("a"));const move=d.touch("touchmove",d.row("a"),145);assert.equal(move.defaultPrevented,false);d.advance(1000);
    assert.equal(d.w.document.querySelector(".my-work-drag-preview"),null);assert.equal(d.writes.length,0);assert.deepEqual(d.ids(),["a","b","c"]);
  }finally{d.dom.window.close();}
});

test("dragging a task upwards shifts the other rows down; cancelled touch drags restore the original position",()=>{
  const d=fixture();try{
    d.pointer("pointerdown",d.row("c"),237);d.advance(1000);d.pointer("pointermove",d.w.document,110);d.frame();
    assert.equal(d.row("a").offsetTop,56,"the first row moves down to make the destination gap");
    d.pointer("pointerup",d.w.document,110);assert.deepEqual(d.ids(),["c","a","b"]);
    d.advance(601);d.touch("touchstart",d.row("c"));d.advance(1000);d.touch("touchmove",d.row("c"),245);d.frame();
    d.w.document.dispatchEvent(new d.w.Event("touchcancel",{bubbles:true}));
    assert.deepEqual(d.ids(),["c","a","b"]);assert.equal(d.writes.length,1);assert.equal(d.w.document.querySelector(".my-work-drag-preview"),null);
  }finally{d.dom.window.close();}
});

test("Escape, pointer cancellation, blur, resize, and rerender cancel rather than save a moved task",()=>{
  for(const cancel of ["escape","pointercancel","blur","resize","rerender"]){
    const d=fixture();try{
      d.pointer("pointerdown",d.row("a"));d.advance(1000);d.pointer("pointermove",d.w.document,245);d.frame();
      if(cancel==="escape")d.w.document.dispatchEvent(new d.w.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
      else if(cancel==="pointercancel")d.pointer("pointercancel",d.w.document);
      else if(cancel==="rerender")d.w.MyWorkReorder.cancel(d.root);
      else d.w.dispatchEvent(new d.w.Event(cancel));
      assert.deepEqual(d.ids(),["a","b","c"]);assert.equal(d.writes.length,0);assert.equal(d.row("a").hidden,false);
      assert.equal(d.w.document.body.classList.contains("my-work-reordering"),false);assert.equal(d.w.document.querySelectorAll(".my-work-drop-gap,.my-work-drag-preview").length,0);
    }finally{d.dom.window.close();}
  }
});

test("touch holds reorder without toggling completion or crossing into the completed section",()=>{
  const d=fixture();try{
    d.touch("touchstart",d.row("a"));d.advance(1000);
    assert.equal(d.touch("touchmove",d.row("a"),500).defaultPrevented,true);d.frame();d.touch("touchend",d.row("a"),500);
    assert.deepEqual(d.ids(),["b","c","a"]);assert.deepEqual(d.ids("completed:2026-11"),["d","e"]);
    assert.equal(d.row("a").querySelector("input").checked,false);assert.equal(d.writes.length,1);
  }finally{d.dom.window.close();}
});

test("keyboard movement preserves filtered-out rows and works with reduced motion",()=>{
  const d=fixture(true);try{
    d.groups.active=["a","hidden","b","c"];
    d.row("a").dispatchEvent(new d.w.KeyboardEvent("keydown",{key:"ArrowDown",altKey:true,bubbles:true,cancelable:true}));
    assert.deepEqual(d.ids(),["b","a","c"]);assert.deepEqual(d.writes[0].ids,["b","hidden","a","c"]);
    assert.equal(d.animations(),0);assert.equal(d.w.document.activeElement,d.row("a"));
    assert.match(d.root.querySelector('[role="status"]').textContent,/position 2/);
  }finally{d.dom.window.close();}
});

test("no-op holds do not save; frame work pauses away from edges and scrolls when needed",()=>{
  const d=fixture();try{
    d.pointer("pointerdown",d.row("a"),150);d.advance(1000);d.pointer("pointermove",d.w.document,160);d.frame();
    assert.equal(d.frames.size,0,"stationary dragging away from edges does not keep measuring layout");
    d.pointer("pointerup",d.w.document,125);assert.equal(d.writes.length,0);
    d.advance(601);d.pointer("pointerdown",d.row("a"));d.advance(1000);d.pointer("pointermove",d.w.document,395);d.frame();
    assert.ok(d.list.scrollTop>0);assert.ok(d.frames.size>0);
    d.w.MyWorkReorder.cancel();assert.equal(d.frames.size,0);
  }finally{d.dom.window.close();}
});

test("personal ordering is validated, keeps new tasks first, and retains immutable task data",()=>{
  const d=fixture();try{
    const api=d.w.MyWorkReorder,task=(id:string)=>({id,title:id,done:false});
    const original=[task("new"),task("a"),task("b")],ordered=api.sort(original,["b","a"]);
    assert.deepEqual(Array.from(ordered,(row:any)=>row.id),["new","b","a"]);assert.deepEqual(original.map(row=>row.id),["new","a","b"]);
    const normalized=api.normalize({active:["a","a",null,{},"b"],"completed:2026-11":["d"],private:["secret"]});
    assert.deepEqual(JSON.parse(JSON.stringify(normalized)),{active:["a","b"],"completed:2026-11":["d"]});
    assert.deepEqual(JSON.parse(JSON.stringify(api.normalize(null))),{});
    assert.deepEqual(Array.from(api.merge(["a","b"],["foreign"])),["a","b"]);
    const css=read("public/my-work-reorder.css");assert.match(css,/brightness\(\.43\)/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/my-work-hold 1s/);
    assert.match(read("public/demo.html"),/Hold for 1 second to move/);
  }finally{d.dom.window.close();}
});
