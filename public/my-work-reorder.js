/* Personal display order only: dragging never edits a shared task or its completion. */
(() => {
  "use strict";
  const contexts=new WeakMap(),animations=new WeakMap(),holdMs=3000,slop=8;
  let gesture=null,suppressUntil=0;
  const reduced=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rows=group=>[...group.children].filter(row=>row.matches("[data-select-my-work]")&&!row.hidden);
  function normalize(value){
    const result={};
    if(!value||typeof value!=="object"||Array.isArray(value))return result;
    for(const [key,ids] of Object.entries(value).slice(0,240)){
      if(!/^(active|completed:\d{4}-\d{2})$/.test(key)||!Array.isArray(ids))continue;
      result[key]=[...new Set(ids.filter(id=>typeof id==="string"&&id.length>0&&id.length<=100))].slice(0,10000);
    }
    return result;
  }
  function sort(tasks,ids){
    const ranks=new Map((Array.isArray(ids)?ids:[]).map((id,index)=>[id,index]));
    // New tasks retain the existing top-of-list behavior until explicitly moved.
    return tasks.slice().sort((a,b)=>{
      const left=ranks.get(a.id),right=ranks.get(b.id);
      return left===undefined?(right===undefined?0:-1):right===undefined?1:left-right;
    });
  }
  function merge(allIds,visibleIds){
    const visible=new Set(visibleIds);
    if(visible.size!==visibleIds.length||visibleIds.some(id=>!allIds.includes(id)))return allIds.slice();
    let index=0;
    return allIds.map(id=>visible.has(id)?visibleIds[index++]:id);
  }
  function announce(root,message){
    let status=root.querySelector("[data-my-work-reorder-status]");
    if(!status){status=document.createElement("div");status.className="my-work-reorder-status";status.dataset.myWorkReorderStatus="";status.setAttribute("role","status");status.setAttribute("aria-live","polite");root.append(status);}
    status.textContent=message;
  }
  function animateShift(group,change){
    const before=new Map(rows(group).map(row=>[row,row.getBoundingClientRect().top]));
    change();
    const motion=!reduced();
    rows(group).forEach(row=>{
      animations.get(row)?.cancel();
      const after=row.getBoundingClientRect().top,delta=(before.get(row)??after)-after;
      if(motion&&delta&&row.animate){const animation=row.animate([{transform:`translateY(${delta}px)`},{transform:"translateY(0)"}],{duration:180,easing:"cubic-bezier(.2,.8,.2,1)"});animations.set(row,animation);gesture?.animations.set(row,animation);}
    });
  }
  function place(g){
    const peers=rows(g.group).filter(row=>row!==g.row),top=g.group.getBoundingClientRect().top;
    const next=peers.find(row=>g.y<top+row.offsetTop+row.offsetHeight/2)||null;
    if(g.gap.nextElementSibling===next)return;
    animateShift(g.group,()=>g.group.insertBefore(g.gap,next));
  }
  function frame(){
    const g=gesture;if(!g?.lifted)return;
    g.frame=null;
    if(!g.root.isConnected||!g.group.isConnected){finish(false);return;}
    const bounds=g.list.getBoundingClientRect(),edge=Math.min(48,bounds.height/4);
    const speed=g.y<bounds.top+edge?-Math.ceil(12*Math.min(1,(bounds.top+edge-g.y)/edge)):g.y>bounds.bottom-edge?Math.ceil(12*Math.min(1,(g.y-bounds.bottom+edge)/edge)):0;
    const previousScroll=g.list.scrollTop;
    if(speed)g.list.scrollTop+=speed;
    g.preview.style.top=`${Math.max(0,Math.min(window.innerHeight-g.height,g.y-g.grabY))}px`;
    place(g);
    if(g.list.scrollTop!==previousScroll)g.frame=window.requestAnimationFrame(frame);
  }
  function lift(){
    const g=gesture;
    if(!g||!g.row.isConnected||!g.group.isConnected)return finish(false);
    g.lifted=true;g.row.classList.remove("is-reorder-holding");
    const rect=g.row.getBoundingClientRect();g.height=rect.height;g.grabY=Math.min(rect.height,Math.max(0,g.y-rect.top));
    g.gap=document.createElement("div");g.gap.className="my-work-drop-gap";g.gap.style.height=`${rect.height}px`;g.gap.setAttribute("aria-hidden","true");
    g.preview=g.row.cloneNode(true);g.preview.classList.remove("is-new","is-completing","is-restoring");g.preview.classList.add("my-work-drag-preview");
    g.preview.removeAttribute("data-select-my-work");g.preview.removeAttribute("data-my-work-reorder-row");g.preview.removeAttribute("role");g.preview.tabIndex=-1;g.preview.inert=true;g.preview.setAttribute("aria-hidden","true");
    g.preview.querySelectorAll("[id]").forEach(node=>node.removeAttribute("id"));
    g.preview.querySelectorAll("input,button").forEach(node=>{node.disabled=true;node.tabIndex=-1;});
    Object.assign(g.preview.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});
    g.group.insertBefore(g.gap,g.row);g.row.hidden=true;g.list.classList.add("is-reordering");document.body.classList.add("my-work-reordering");document.body.append(g.preview);
    if(g.kind==="pointer")try{g.list.setPointerCapture(g.id);}catch{}
    announce(g.root,`Lifted ${g.title}. Drag up or down within this section. Escape cancels.`);
    g.frame=window.requestAnimationFrame(frame);
  }
  function begin(event,point,kind,id){
    if(gesture)return;
    const row=event.target.closest?.("[data-my-work-reorder-row]");
    if(!row||event.target.closest("input,button,select,textarea,a,[contenteditable=true]"))return;
    const root=row.closest("[data-my-work-sort-root]"),context=contexts.get(root),group=row.parentElement,list=row.closest(".my-work-task-list");
    if(!context||!group.matches("[data-my-work-sort-group]")||rows(group).length<2)return;
    gesture={root,context,group,list,row,id,kind,x:point.clientX,y:point.clientY,startX:point.clientX,startY:point.clientY,title:row.querySelector("strong")?.textContent||"Task",lifted:false,animations:new Map()};
    row.classList.add("is-reorder-holding");gesture.timer=window.setTimeout(lift,holdMs);
  }
  function move(event,point){
    const g=gesture;if(!g)return;
    if(!g.lifted&&Math.hypot(point.clientX-g.startX,point.clientY-g.startY)>slop){finish(false);return;}
    g.x=point.clientX;g.y=point.clientY;
    if(g.lifted){if(event.cancelable)event.preventDefault();if(!g.frame)g.frame=window.requestAnimationFrame(frame);}
  }
  function finish(save){
    const g=gesture;if(!g)return;
    window.clearTimeout(g.timer);g.row.classList.remove("is-reorder-holding");
    if(g.lifted){
      window.cancelAnimationFrame(g.frame);
      if(save&&g.group.isConnected){place(g);g.group.insertBefore(g.row,g.gap);}
      g.gap.remove();g.preview.remove();g.row.hidden=false;g.list.classList.remove("is-reordering");document.body.classList.remove("my-work-reordering");
      g.animations.forEach(animation=>animation.cancel());
      if(g.kind==="pointer")try{g.list.releasePointerCapture(g.id);}catch{}
      suppressUntil=Date.now()+600;
      const ids=rows(g.group).map(row=>row.dataset.selectMyWork),all=g.context.groups[g.group.dataset.myWorkSortGroup]||ids;
      gesture=null;
      if(save&&g.root.isConnected){const order=merge(all,ids);if(order.some((id,index)=>id!==all[index]))g.context.onReorder(g.group.dataset.myWorkSortGroup,order);announce(g.root,`Moved ${g.title} to position ${ids.indexOf(g.row.dataset.selectMyWork)+1} of ${ids.length}.`);}
      else announce(g.root,"Task move cancelled.");
      g.row.focus({preventScroll:true});
    }else gesture=null;
  }
  document.addEventListener("pointerdown",event=>{if(event.pointerType!=="touch"&&event.button===0&&event.isPrimary!==false)begin(event,event,"pointer",event.pointerId);});
  document.addEventListener("pointermove",event=>{if(gesture?.kind==="pointer"&&event.pointerId===gesture.id)move(event,event);},{passive:false});
  document.addEventListener("pointerup",event=>{if(gesture?.kind==="pointer"&&event.pointerId===gesture.id){gesture.y=event.clientY;finish(true);}});
  document.addEventListener("pointercancel",event=>{if(gesture?.kind==="pointer"&&event.pointerId===gesture.id)finish(false);});
  document.addEventListener("touchstart",event=>{if(event.touches.length!==1){finish(false);return;}begin(event,event.touches[0],"touch",event.touches[0].identifier);},{passive:true});
  document.addEventListener("touchmove",event=>{if(gesture?.kind!=="touch")return;const point=[...event.touches].find(point=>point.identifier===gesture.id);if(point)move(event,point);},{passive:false});
  document.addEventListener("touchend",event=>{if(gesture?.kind!=="touch")return;const point=[...event.changedTouches].find(point=>point.identifier===gesture.id);if(point){gesture.y=point.clientY;finish(true);}},{passive:true});
  document.addEventListener("touchcancel",()=>finish(false),{passive:true});
  document.addEventListener("click",event=>{if(gesture?.lifted||Date.now()<suppressUntil){const row=event.target.closest?.("[data-my-work-reorder-row]");if(row){event.preventDefault();event.stopImmediatePropagation();}}},true);
  document.addEventListener("contextmenu",event=>{if(gesture?.row.contains(event.target))event.preventDefault();});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&gesture){event.preventDefault();event.stopImmediatePropagation();finish(false);return;}
    if(gesture||!event.altKey||!["ArrowUp","ArrowDown"].includes(event.key)||!event.target.matches?.("[data-my-work-reorder-row]"))return;
    const row=event.target,root=row.closest("[data-my-work-sort-root]"),context=contexts.get(root),group=row.parentElement;
    if(!context)return;
    event.preventDefault();event.stopPropagation();
    const items=rows(group),index=items.indexOf(row),next=index+(event.key==="ArrowUp"?-1:1);
    if(next<0||next>=items.length)return;
    animateShift(group,()=>group.insertBefore(row,event.key==="ArrowUp"?items[next]:items[next].nextSibling));
    const ids=rows(group).map(item=>item.dataset.selectMyWork);
    context.onReorder(group.dataset.myWorkSortGroup,merge(context.groups[group.dataset.myWorkSortGroup]||ids,ids));
    announce(root,`Moved ${row.querySelector("strong")?.textContent||"task"} to position ${next+1} of ${items.length}.`);row.focus({preventScroll:true});
  },true);
  window.addEventListener("blur",()=>finish(false));window.addEventListener("resize",()=>finish(false));
  document.addEventListener("visibilitychange",()=>{if(document.hidden)finish(false);});
  window.MyWorkReorder={normalize,sort,merge,mount(root,context){contexts.set(root,context);root.dataset.myWorkSortRoot="";},cancel(root){if(!root||gesture?.root===root)finish(false);}};
})();
