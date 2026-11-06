(() => {
  "use strict";
  const DATE="2026-11-05",levels=["Unrated","1 / Routine","2 / Standard","3 / Moderate","4 / Complex","5 / Specialist"];
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const num=value=>Number(value).toLocaleString("en-GB",{maximumFractionDigits:1});
  const label=team=>team==="tax"?"Tax":"Accounting";
  function seeds(){
    const staff=[{id:"tax-ayu",team:"tax",name:"Ayu",title:"Senior / reviewer",level:5,capacity:70,other:22},{id:"tax-bima",team:"tax",name:"Bima",title:"Intermediate",level:3,capacity:100,other:12},{id:"tax-citra",team:"tax",name:"Citra",title:"Developing staff",level:2,capacity:80,other:12},{id:"acc-dian",team:"acc",name:"Dian",title:"Developing staff",level:2,capacity:100,other:10},{id:"acc-eka",team:"acc",name:"Eka",title:"Experienced staff",level:4,capacity:90,other:20},{id:"acc-farah",team:"acc",name:"Farah",title:"Senior / reviewer",level:5,capacity:90,other:25}];
    const client=(n,name,tax,acc,note)=>({id:"client-"+n,code:"CL-DEMO-"+String(n).padStart(3,"0"),name,tax:{applies:true,difficulty:tax[0],hours:tax[1],pic:tax[2],note,review:tax[0]===null?null:{by:"Senior reviewer",date:DATE}},acc:acc?{applies:true,difficulty:acc[0],hours:acc[1],pic:acc[2],note,review:{by:"Senior reviewer",date:DATE}}:{applies:false,difficulty:null,hours:null,pic:null,note:"Tax-only individual client",review:null}});
    const clients=[
      client(1,"PT Nusa Retail",[3,24,"tax-citra"],[2,14,"acc-dian"],"Several outlets; regular reconciliation"),
      client(2,"CV Samudra Niaga",[4,22,"tax-citra"],[4,24,"acc-eka"],"Inventory and inter-branch differences"),
      client(3,"PT Lembah Pangan",[2,18,"tax-citra"],[3,18,"acc-dian"],"Large volume, mostly repeatable work"),
      client(4,"PT Pusaka Manufaktur",[3,16,"tax-citra"],[4,28,"acc-eka"],"Production costing and reconciliations"),
      client(5,"CV Lentera Jasa",[1,10,"tax-citra"],[2,20,"acc-dian"],"Routine filings; high document volume"),
      client(6,"PT Karya Teknik",[3,12,"tax-bima"],[3,18,"acc-farah"],"Project-based income and deductions"),
      client(7,"PT Tirta Hotel",[2,14,"tax-bima"],[3,22,"acc-dian"],"Multiple revenue streams"),
      client(8,"PT Bina Digital",[2,10,"tax-bima"],[2,20,"acc-farah"],"Stable records and monthly routine"),
      client(9,"PT Cakra Ekspor",[5,16,"tax-ayu"],[5,18,"acc-eka"],"Specialist judgment and review required"),
      client(10,"PT Harmoni Holdings",[4,20,"tax-ayu"],[4,null,"acc-farah"],"Group transactions; ACC hours not assessed"),
      client(11,"Raka Pradana",[null,null,"tax-ayu"],null,"New scope; needs first assessment"),
      client(12,"Sari Utami",[1,8,null],null,"Tax-only client; PIC not allocated yet")
    ];
    return {staff,clients};
  }
  let data=seeds(),team="tax",drafts={},selected=new Set(),activity=[],revision=0,reviewed=null,toastTimer;
  const manager=()=>$("#role").value==="manager",assessor=()=>["manager","reviewer"].includes($("#role").value);
  const staffFor=t=>data.staff.filter(p=>p.team===t),person=id=>data.staff.find(p=>p.id===id),client=id=>data.clients.find(c=>c.id===id);
  const pic=(c,t,planned=false)=>planned&&Object.hasOwn(drafts[c.id]||{},t)?drafts[c.id][t]:c[t].pic;
  const picName=id=>person(id)?.name||"No PIC";
  function metrics(p,planned=false){
    const clients=data.clients.filter(c=>c[p.team].applies&&pic(c,p.team,planned)===p.id);
    const hours=clients.reduce((sum,c)=>sum+(c[p.team].hours===null?0:c[p.team].hours),0);
    return {clients:clients.length,hours,total:hours+p.other,missing:clients.filter(c=>c[p.team].hours===null).length,unrated:clients.filter(c=>c[p.team].difficulty===null).length,support:clients.filter(c=>c[p.team].difficulty!==null&&c[p.team].difficulty>p.level).length,ratio:p.capacity?(hours+p.other)/p.capacity*100:null};
  }
  const load=(p,m)=>p.capacity?(m.missing?"At least ":"")+num(m.ratio)+"%":"No capacity";
  const over=(p,m)=>m.total>p.capacity;
  function changes(){
    return data.clients.flatMap(c=>["tax","acc"].filter(t=>c[t].applies&&Object.hasOwn(drafts[c.id]||{},t)&&drafts[c.id][t]!==c[t].pic).map(t=>({clientId:c.id,team:t,from:c[t].pic,to:drafts[c.id][t]})));
  }
  function stage(id,t,next){
    const c=client(id);if(!manager()||!c||!c[t]?.applies)return false;
    if(next!==null&&!staffFor(t).some(p=>p.id===next))return false;
    drafts[id]||={};
    if(next===c[t].pic)delete drafts[id][t];else drafts[id][t]=next;
    if(!Object.keys(drafts[id]).length)delete drafts[id];
    revision++;return true;
  }
  function risks(list){
    const issues=new Set(),affected=new Set();
    for(const change of list){
      const c=client(change.clientId),assessment=c[change.team],next=person(change.to);
      if(change.from)affected.add(change.from);if(change.to)affected.add(change.to);
      if(!next)issues.add(`${c.name} / ${label(change.team)} will have no PIC.`);
      if(assessment.difficulty===null)issues.add(`${c.name} / ${label(change.team)} difficulty is unrated.`);
      if(assessment.hours===null)issues.add(`${c.name} / ${label(change.team)} hours are missing.`);
      if(next&&assessment.difficulty!==null&&assessment.difficulty>next.level)issues.add(`${c.name}: level ${assessment.difficulty} exceeds ${next.name}'s independent level ${next.level}; arrange review/support.`);
    }
    for(const id of affected){const p=person(id),m=metrics(p,true);if(over(p,m))issues.add(`${p.name} / ${label(p.team)} would remain over capacity (${num(m.total)}h / ${num(p.capacity)}h).`);if(m.missing)issues.add(`${p.name}'s planned load is incomplete: ${m.missing} client hour estimate(s) missing.`);}
    return [...issues];
  }
  function toast(text){clearTimeout(toastTimer);$("#status").textContent=text;$("#status").classList.add("visible");toastTimer=setTimeout(()=>$("#status").classList.remove("visible"),4000);}
  function record(type,text,details){activity.unshift({id:"EVENT-DEMO-"+(activity.length+1),type,text,details:structuredClone(details),date:DATE,actor:$("#role").selectedOptions[0].textContent});}
  function visible(){
    const q=$("#search").value.trim().toLowerCase(),filter=$("#pic-filter").value,attention=$("#attention").value;
    return data.clients.filter(c=>{
      const a=c[team],owner=person(pic(c,team,true)),support=a.applies&&owner&&a.difficulty!==null&&a.difficulty>owner.level;
      return (!q||[c.name,c.code,a.note].join(" ").toLowerCase().includes(q))&&(filter==="all"||a.applies&&(filter==="none"?!a.pic:a.pic===filter))&&(attention==="all"||a.applies&&(attention==="support"?support:attention==="unrated"?a.difficulty===null:attention==="unestimated"?a.hours===null:attention==="unassigned"?!a.pic:attention==="changed"?Object.hasOwn(drafts[c.id]||{},team):false));
    });
  }
  function options(t,current,placeholder=false){return (placeholder?'<option value="">Choose PIC...</option>':'')+'<option value="none" '+(!current?"selected":"")+'>No PIC</option>'+staffFor(t).map(p=>'<option value="'+p.id+'" '+(current===p.id?"selected":"")+'>'+esc(p.name)+'</option>').join("");}
  function renderStaff(){
    $("#staff-rows").innerHTML=staffFor(team).sort((a,b)=>{
      const x=metrics(a,true),y=metrics(b,true);return (y.ratio??(y.total?Infinity:0))-(x.ratio??(x.total?Infinity:0));
    }).map(p=>{
      const before=metrics(p),after=metrics(p,true),changed=before.total!==after.total||before.clients!==after.clients,bar=after.ratio===null?(after.total?100:0):Math.min(100,after.ratio),tone=over(p,after)?"over":(after.ratio||0)>=90?"near":"";
      return `<tr data-staff-row="${p.id}" class="${$("#pic-filter").value===p.id?"selected":""}"><td><button class="pic-button" data-filter-pic="${p.id}" aria-pressed="${$("#pic-filter").value===p.id}">${esc(p.name)}<small>${esc(p.title)} / ${after.clients} client(s)</small></button></td><td><select data-staff-field="level" data-staff="${p.id}" aria-label="${p.name} independent level" ${manager()?"":"disabled"}>${levels.slice(1).map((text,i)=>`<option value="${i+1}" ${p.level===i+1?"selected":""}>${text}</option>`).join("")}</select></td><td><input type="number" min="0" max="300" step="0.5" data-staff-field="capacity" data-staff="${p.id}" aria-label="${p.name} available hours" value="${p.capacity}" ${manager()?"":"disabled"}></td><td><input type="number" min="0" max="300" step="0.5" data-staff-field="other" data-staff="${p.id}" aria-label="${p.name} other work hours" value="${p.other}" ${manager()?"":"disabled"}></td><td class="number">${changed?`${num(before.hours)} <span class="delta">&rarr; ${num(after.hours)}</span>`:num(after.hours)}h</td><td class="load-cell"><div class="load-line"><strong data-load-planned="${p.id}" class="${over(p,after)?"danger":""}">${esc(load(p,after))}</strong>${changed?`<span data-load-current="${p.id}" class="subline">was ${esc(load(p,before))}</span>`:""}</div><div class="track" role="img" aria-label="${esc(p.name+': '+load(p,after))}"><span class="${tone}" style="width:${bar}%"></span></div><div class="subline">${num(after.total)}h / ${num(p.capacity)}h${over(p,after)?" / Over capacity":""}${changed?" / Proposed":""}</div></td><td>${after.support?`<span class="tag warning">${after.support} needs review</span>`:'<span class="subline">Within level</span>'}</td><td>${after.missing?`<span class="tag warning">${after.missing} hours missing</span>`:""} ${after.unrated?`<span class="tag warning">${after.unrated} unrated</span>`:""}${!after.missing&&!after.unrated?'<span class="subline">Assessed</span>':""}</td></tr>`;
    }).join("");
    const applicable=data.clients.filter(c=>c[team].applies),rated=applicable.filter(c=>c[team].difficulty!==null).length,estimated=applicable.filter(c=>c[team].hours!==null).length,unassigned=applicable.filter(c=>!pic(c,team,true)).length;
    $("#coverage").innerHTML=`<span><strong>${rated}/${applicable.length}</strong> difficulty rated</span><span><strong>${estimated}/${applicable.length}</strong> hours estimated</span>${unassigned?`<span class="warning"><strong>${unassigned}</strong> no PIC</span>`:""}`;
  }
  function renderClients(){
    const rows=visible();selected=new Set([...selected].filter(id=>rows.some(c=>c.id===id&&c[team].applies)));
    $("#client-rows").innerHTML=rows.map(c=>{
      const a=c[team],next=pic(c,team,true),p=person(next),changed=Object.hasOwn(drafts[c.id]||{},team),support=p&&a.difficulty!==null&&a.difficulty>p.level;
      const disabled=!assessor()||!a.applies;
      const fit=!a.applies?'<span class="tag">Not applicable</span>':!p?'<span class="tag warning">No PIC</span>':a.difficulty===null?'<span class="tag warning">Unrated</span>':support?`<span class="tag warning">Needs reviewer / L${a.difficulty}</span>`:'<span class="tag">Within level</span>';
      return `<tr data-client-row="${c.id}" class="${changed?"pending":""}"><td><input type="checkbox" data-select="${c.id}" aria-label="Select ${esc(c.name)}" ${selected.has(c.id)?"checked":""} ${manager()&&a.applies?"":"disabled"}></td><td>${data.clients.indexOf(c)+1}</td><td><strong>${esc(c.name)}</strong><small>${c.code}${a.review?" / Reviewed "+a.review.date.split("-").reverse().join("/"):""}</small></td><td><select data-assess-field="difficulty" data-client="${c.id}" aria-label="${esc(c.name)} ${label(team)} difficulty" ${disabled?"disabled":""}>${levels.map((text,i)=>`<option value="${i||""}" ${a.difficulty===(i||null)?"selected":""}>${text}</option>`).join("")}</select></td><td><input type="number" min="0" max="300" step="0.5" data-assess-field="hours" data-client="${c.id}" aria-label="${esc(c.name)} ${label(team)} monthly hours" placeholder="Unknown" value="${a.hours??""}" ${disabled?"disabled":""}></td><td>${esc(a.applies?picName(a.pic):"Not applicable")}</td><td>${a.applies?`<select class="${changed?"next-field":""}" data-pic-next="${c.id}" aria-label="Next ${label(team)} PIC for ${esc(c.name)}" ${manager()?"":"disabled"}>${options(team,next)}</select>`:'<span class="subline">Not applicable</span>'}</td><td><input data-assess-field="note" data-client="${c.id}" aria-label="Assessment note for ${esc(c.name)}" maxlength="250" value="${esc(a.note)}" ${disabled?"disabled":""}></td><td>${fit}</td></tr>`;
    }).join("")||'<tr><td colspan="9" class="empty">No clients match these filters.</td></tr>';
    const eligible=rows.filter(c=>c[team].applies),all=$("#select-all");all.checked=eligible.length>0&&selected.size===eligible.length;all.indeterminate=selected.size>0&&selected.size<eligible.length;all.disabled=!manager()||!eligible.length;
    $("#visible-count").textContent=rows.length+" client rows";
    $("#bulk-actions").hidden=!manager()||!selected.size;$("#selected-count").textContent=selected.size+" selected";
    $("#bulk-pic").innerHTML=options(team,"placeholder",true);$("#bulk-pic").value="";
    $("#scope-note").textContent=label(team)+" assessments only. No PIC and Not applicable are different.";
  }
  function render(){
    document.querySelectorAll("[data-team]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.team===team)));
    $("#team-content").setAttribute("aria-labelledby",team+"-tab");
    const current=$("#pic-filter").value||"all";
    $("#pic-filter").innerHTML='<option value="all">All '+label(team)+' PIC</option><option value="none">No PIC</option>'+staffFor(team).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
    $("#pic-filter").value=["all","none",...staffFor(team).map(p=>p.id)].includes(current)?current:"all";
    const count=changes().length;$("#pending-count").textContent=count;$("#review-plan").disabled=!manager()||!count;$("#reset-plan").disabled=!manager()||!count;
    renderStaff();renderClients();
    $("#activity-count").textContent=activity.length;
    $("#activity-list").innerHTML=activity.slice(0,8).map(e=>`<div>${esc(e.text)}<small>${esc(e.id+" / "+e.actor+" / "+e.date)}</small></div>`).join("")||'<p class="subline">No changes made in this preview.</p>';
  }
  function openReview(){
    const list=changes();if(!manager()||!list.length)return;
    const warnings=risks(list),ids=new Set(list.flatMap(c=>[c.from,c.to]).filter(Boolean));
    reviewed={revision,list:structuredClone(list),warnings};
    $("#review-content").innerHTML=`<section class="review-section"><h3>Capacity impact / both teams</h3><div class="table-scroll"><table><thead><tr><th>PIC</th><th>Workload h</th><th>Estimated load</th><th>Support needed</th></tr></thead><tbody>${[...ids].map(id=>{const p=person(id),a=metrics(p),b=metrics(p,true);return `<tr><td>${esc(p.name)} / ${label(p.team)}</td><td>${num(a.total)}h &rarr; <strong>${num(b.total)}h</strong></td><td>${esc(load(p,a))} &rarr; <strong class="${over(p,b)?"danger":"delta"}">${esc(load(p,b))}</strong></td><td>${a.support} &rarr; ${b.support}</td></tr>`;}).join("")}</tbody></table></div></section><section class="review-section"><h3>${list.length} client assignment change(s)</h3><div class="table-scroll"><table><thead><tr><th>Client</th><th>Team</th><th>Current PIC</th><th>Next PIC</th></tr></thead><tbody>${list.map(c=>`<tr><td>${esc(client(c.clientId).name)}</td><td>${label(c.team)}</td><td>${picName(c.from)}</td><td>${picName(c.to)}</td></tr>`).join("")}</tbody></table></div></section>${warnings.length?'<ul class="risk-list">'+warnings.map(text=>'<li>'+esc(text)+'</li>').join("")+'</ul>':'<p class="subline review-section">No estimated overload or skill mismatch created by this plan.</p>'}`;
    $("#reason").value="";$("#reason").required=warnings.length>0;$("#review-error").textContent="";$("#review-dialog").showModal();
  }
  document.addEventListener("click",event=>{
    const target=event.target.closest?.("button");if(!target||target.disabled)return;
    if(target.dataset.team){team=target.dataset.team;selected.clear();$("#pic-filter").value="all";render();}
    if(target.dataset.filterPic){$("#pic-filter").value=$("#pic-filter").value===target.dataset.filterPic?"all":target.dataset.filterPic;render();}
    if(target.id==="reset-filters"){$("#search").value="";$("#pic-filter").value="all";$("#attention").value="all";render();}
    if(target.id==="clear-selection"){selected.clear();render();}
    if(target.id==="reset-plan"&&manager()){drafts={};selected.clear();revision++;render();toast("Unsaved PIC changes reset. Assessments are retained.");}
    if(target.id==="reset-demo"){data=seeds();drafts={};activity=[];selected.clear();team="tax";reviewed=null;revision++;$("#search").value="";$("#attention").value="all";$("#pic-filter").value="all";render();toast("Fictional sample restored.");}
    if(target.id==="review-plan")openReview();
    if(target.hasAttribute("data-close-review"))$("#review-dialog").close();
  });
  document.addEventListener("change",event=>{
    const input=event.target;
    if(input.id==="role"){selected.clear();render();return;}
    if(["pic-filter","attention"].includes(input.id)){render();return;}
    if(input.dataset.assessField){
      const c=client(input.dataset.client),a=c?.[team],field=input.dataset.assessField;
      if(!assessor()||!a?.applies){render();return;}
      let value=field==="note"?input.value.trim().slice(0,250):input.value===""?null:Number(input.value);
      if(field!=="note"&&value!==null&&(!Number.isFinite(value)||value<0||value>300||field==="difficulty"&&(!Number.isInteger(value)||value<1||value>5))){input.value=a[field]??"";toast("Use a valid difficulty or non-negative monthly hour estimate.");return;}
      if(value!==a[field]){const before=structuredClone(a);a[field]=value;a.review={by:$("#role").selectedOptions[0].textContent,date:DATE};revision++;record("assessment",`${c.name} / ${label(team)}: ${field} updated.`,{clientId:c.id,team,before,after:structuredClone(a)});render();}return;
    }
    if(input.dataset.staffField){
      const p=person(input.dataset.staff),field=input.dataset.staffField,value=Number(input.value);
      if(!manager()||!p){render();return;}
      if(input.value===""||!Number.isFinite(value)||value<0||value>300||field==="level"&&(!Number.isInteger(value)||value<1||value>5)){input.value=p[field];toast("Use a valid working level or capacity from 0 to 300 hours.");return;}
      if(p[field]!==value){const before=p[field];p[field]=value;revision++;record("capacity",`${p.name}: ${field} updated.`,{staffId:p.id,field,before,after:value});render();}return;
    }
    if(input.dataset.picNext){stage(input.dataset.picNext,team,input.value==="none"?null:input.value);render();return;}
    if(input.dataset.select){if(manager()&&client(input.dataset.select)?.[team].applies){if(input.checked)selected.add(input.dataset.select);else selected.delete(input.dataset.select);}render();return;}
    if(input.id==="select-all"&&manager()){selected=input.checked?new Set(visible().filter(c=>c[team].applies).map(c=>c.id)):new Set();render();return;}
    if(input.id==="bulk-pic"&&input.value&&manager()){for(const id of selected)stage(id,team,input.value==="none"?null:input.value);render();}
  });
  $("#search").addEventListener("input",render);
  $("#apply-form").addEventListener("submit",event=>{
    event.preventDefault();if(!manager()||!reviewed||!$("#review-dialog").open)return;
    if(reviewed.revision!==revision){$("#review-error").textContent="The plan changed. Close and review again.";return;}
    const reason=$("#reason").value.trim();if(reviewed.warnings.length&&!reason){$("#review-error").textContent="Add a reason or a named support plan for the flagged changes.";return;}
    const snapshot=reviewed.list.map(change=>({...change,assessment:structuredClone(client(change.clientId)[change.team])}));
    for(const change of reviewed.list)client(change.clientId)[change.team].pic=change.to;
    record("allocation",`${reviewed.list.length} PIC change(s) applied in demo.`,{changes:snapshot,reason,warnings:reviewed.warnings});
    drafts={};selected.clear();reviewed=null;revision++;$("#review-dialog").close();render();toast("Preview allocation applied. No live records changed.");
  });
  render();
})();
