(() => {
  "use strict";
  const hosts=new Map(),tabs=new Map();
  const taxCatalog=window.CaseTaxTypes;
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const money=value=>"Rp"+Number(value||0).toLocaleString("id-ID");
  const date=value=>value?value.slice(0,10).split("-").reverse().join("/"):"-";
  const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Makassar",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const initial=()=>({result:null,products:[],schedule:[],payments:[],events:[],final:null});
  const status=w=>{
    const total=w.products.reduce((s,p)=>s+p.amount,0),paid=w.payments.filter(p=>p.verified).reduce((s,p)=>s+p.amount,0);
    const settled=Boolean(w.result)&&total===paid,executed=settled&&w.products.every(p=>!p.revise||p.filing);
    return {total,paid,settled,executed,attention:settled&&!executed&&!w.final&&!w.examinationClosure};
  };
  const button=(item,action,label,disabled=false,key="")=>`<button type="button" class="tiny-btn" data-cwf-case="${esc(item.id)}" data-cwf-action="${action}" data-cwf-key="${esc(key)}" ${disabled?"disabled":""}>${esc(label)}</button>`;
  const block=(title,html)=>`<section class="case-workflow-block"><h4>${esc(title)}</h4>${html}</section>`;
  function summary(item){
    const w=item.workflow;
    if(w?.examinationClosure){const s=status(w),psa=w.products.some(p=>window.CaseAssessmentUI?.ongoing(p.assessment?.psa));return !s.settled?'SPHP closed / payment pending':psa?'SPHP closed / PSA ongoing':'Examination closed at SPHP';}
    if(w?.final||item.stage==="Closed")return "Closed";
    if(!w?.result)return !item.stage||item.stage==="Waiting Client Docs"?"In Progress":item.stage;
    const s=status(w);
    return w.final?"Closed":!s.settled?"Awaiting payment":!s.executed?"Paid / revision pending":item.caseCategory==="Pemeriksaan"?"Ready for closure":"Awaiting SP3P2DK";
  }
  function render(item,progressHtml,host){
    hosts.set(item.id,{item,...host});
    window.CaseAssessmentUI?.registerHost(item,host);
    const w=item.workflow||initial(),s=status(w),tab=tabs.get(item.id)||"progress";
    const available=item.workflowAvailable&&host.canManage!==false&&!host.offline&&!item.id.startsWith("case-");
    const examination=item.caseCategory==="Pemeriksaan",closed=(item.stage==="Closed"&&!w.examinationClosure)||Boolean(w.final),canTax=available&&host.canTax&&!closed;
    const stageAction=examination?!w.examinationClosure?window.CaseAssessmentUI?.action(item,'close-examination','Record SPHP & close examination','',!available||closed)||'':'':!w.result?button(item,'record-result','Record BA & close discussion',!available||closed):'';
    const controls=`<div class="case-workflow-tabs" role="tablist" aria-label="Case workflow">${[["progress","Progress"],["payments","Payments & Instalments"],[examination?"psa":"tax",examination?"PSA":"Tax Execution"]].map(([key,label])=>`<button type="button" role="tab" data-cwf-case="${esc(item.id)}" data-cwf-tab="${key}" aria-selected="${tab===key}">${label}</button>`).join("")}<div class="case-workflow-status">${stageAction}<span class="pill ${s.attention&&!examination?"warning":"neutral"}">${esc(summary(item))}</span></div></div>`;
    let body="";
    if(tab==="progress"){
      const result=w.examinationClosure?`<div class="case-workflow-result"><strong>SPHP ${esc(w.examinationClosure.number)}</strong><span>${date(w.examinationClosure.date)}</span><span>Examination stage closed. Assessments, payments and PSA remain active.</span></div>`:w.result?`<div class="case-workflow-result"><strong>${esc(w.result.kind)} ${esc(w.result.number)}</strong><span>${date(w.result.date)}</span><span>${esc(w.result.text)}</span><strong>${money(s.total)}</strong></div>`:'';
      const response=item.caseCategory==="Pemeriksaan"?`${item.sphpDate?`<p class="subline">SPHP: ${date(item.sphpDate)}</p>`:""}${w.response?`<p class="subline">Response: ${esc(w.response.number)} / ${date(w.response.date)}</p>`:""}${!w.response&&!w.examinationClosure?button(item,"record-response","Record SPHP response",!available||closed):""}`:"";
      const note=!available&&!host.offline?`<p class="case-progress-notice">${item.id.startsWith("case-")?"Save this case to enable workflow actions.":"Workflow unavailable. Database update required."}</p>`:"";
      const documents=examination&&w.examinationClosure?window.CaseAssessmentUI?.documents(item,host)||'':'';
      const insertion=controls+block(examination?"Examination / SPHP":"Discussion result",note+result+response)+documents;
      body=progressHtml.replace('<div class="case-progress-viewport">','<div class="case-progress-viewport">'+insertion);
    }else if(tab==="payments"){
      const paidBy=id=>w.payments.filter(p=>p.verified&&p.scheduleId===id).reduce((s,p)=>s+p.amount,0);
      body=block("Payments & Instalments",!w.result?'<p class="subline">Record BA / SKP in Progress first.</p>':`<div class="case-workflow-totals"><span>Payable <strong>${money(s.total)}</strong></span><span>Verified paid <strong>${money(s.paid)}</strong></span><span>Remaining <strong>${money(s.total-s.paid)}</strong></span>${button(item,"set-plan","Set instalments",!available||closed||!s.total)}</div><div class="case-workflow-scroll"><table><thead><tr><th>Tax byproduct</th><th>Period</th><th>Internal target</th><th>Scheduled</th><th>Verified paid</th><th>Remaining</th><th>Action</th></tr></thead><tbody>${w.schedule.map(row=>{const p=w.products.find(p=>p.id===row.productId),remaining=row.amount-paidBy(row.id),reserved=w.payments.filter(p=>p.scheduleId===row.id).reduce((s,p)=>s+p.amount,0);return `<tr><td>${esc(p.tax)}</td><td>${esc(p.period)}</td><td>${date(row.due)}${remaining>0&&row.due<today()?'<span class="pill warning">Overdue</span>':""}</td><td>${money(row.amount)}</td><td>${money(paidBy(row.id))}</td><td>${money(remaining)}</td><td>${remaining>0?button(item,"record-payment","Record payment",!canTax||reserved>=row.amount,row.id):"Paid"}</td></tr>`;}).join("")||'<tr><td colspan="7">No payment required.</td></tr>'}</tbody></table></div><p class="subline">Only verified receipts reduce the balance.</p><details><summary>Receipts (${w.payments.length})</summary><div class="case-workflow-receipts">${w.payments.map(p=>`<div>${money(p.amount)} / ${date(p.date)} / ${esc(p.proof||"Reference pending")} <span class="pill ${p.verified?"accent":"warning"}">${p.verified?"Verified":"Unverified"}</span>${!p.verified?button(item,"verify-payment","Verify receipt",!canTax,p.id):""}</div>`).join("")}</div></details>`);
    }else if(tab==='psa'&&examination){
      const counts=window.CaseAssessmentUI?.count([item]);
      body=`<div class="case-assessment-heading"><p class="subline">${counts?.ongoing||0} ongoing / ${counts?.successful||0} successful / ${counts?.rejected||0} rejected</p><button type="button" class="tiny-btn" data-cwf-case="${esc(item.id)}" data-cwf-penalty>Open in Penalty Removal</button></div>`+(window.CaseAssessmentUI?.documents(item,host,'psa')||'');
    }else{
      body=block("Tax Execution",!w.result?'<p class="subline">Record BA / SKP first.</p>':`${s.attention?`<p class="case-progress-notice"><strong>Supervisor attention:</strong> Revisions pending with ${esc(item.taxPic||"the Tax PIC")}. Target: ${date(w.revisionTarget)}.</p>`:!s.settled?'<p class="case-progress-notice">Verify all payments before recording SPT submissions.</p>':""}<div class="case-workflow-scroll"><table><thead><tr><th>Tax byproduct</th><th>Period</th><th>Payable</th><th>Revision / submission receipt</th></tr></thead><tbody>${w.products.map(p=>`<tr><td>${esc(p.tax)}</td><td>${esc(p.period)}</td><td>${money(p.amount)}</td><td>${p.revise?p.filing?`${esc(p.filing.number)} / ${date(p.filing.date)}`:button(item,"record-filing","Record revised SPT",!canTax||!s.settled,p.id):"Revision not required"}</td></tr>`).join("")||'<tr><td colspan="4">No tax byproducts.</td></tr>'}</tbody></table></div><div class="case-workflow-final">${w.final?`<strong>Closed / ${esc(w.final.number)} / ${date(w.final.date)}</strong>`:button(item,"record-final",item.caseCategory==="Pemeriksaan"?"Record examination closure":"Record SP3P2DK & close case",!canTax||!s.executed)}${!s.executed?'<p class="subline">Complete payments and required revisions to close.</p>':""}</div>`);
    }
    return tab==="progress"?body:`<div class="case-progress-viewport">${controls}${body}</div>`;
  }
  const field=(name,label,value="",extra="")=>`<label>${esc(label)}<input class="field" name="${name}" value="${esc(value)}" ${extra}></label>`;
  function dateField(name,label,value=today()){return field(name,label,date(value),'placeholder="dd/mm/yyyy" inputmode="numeric" required');}
  function open(host,action,key){
    document.getElementById("case-workflow-dialog")?.remove();
    const {item}=host,w=item.workflow||initial(),s=status(w),kind=item.caseCategory==="Pemeriksaan"?"SKP":"BA";
    let fields="",title="",submit="Save";
    let productIndex=0;
    const productRow=(tax="")=>{
      const i=productIndex++;
      const options=taxCatalog.groups.map(group=>`<optgroup label="${esc(group.label)}">${group.taxes.map(value=>`<option ${tax===value?"selected":""}>${esc(value)}</option>`).join("")}</optgroup>`).join("");
      return `<tr data-cwf-product="${i}"><td data-label="Tax byproduct"><select class="field" name="tax-${i}" aria-label="Tax type" required><option value="" disabled ${tax?"":"selected"}>Choose tax</option>${options}<option value="${taxCatalog.otherValue}">Other / Lainnya...</option></select><label class="case-workflow-custom" hidden>Other tax name<input class="field" name="customTax-${i}" maxlength="80" disabled></label></td><td data-label="Period / year"><input class="field" name="period-${i}" aria-label="Tax period" value="${esc(item.taxYear||"")}" maxlength="40" required></td><td data-label="Payable (Rp)"><input class="field" name="amount-${i}" aria-label="Payable in rupiah" inputmode="numeric" value="0" required></td><td data-label="Revise SPT"><input type="checkbox" name="revise-${i}" aria-label="Requires revised SPT" ${kind==="BA"?"checked":""}></td><td class="case-workflow-remove-cell"><button type="button" class="ghost-btn case-workflow-remove" data-cwf-remove-product aria-label="Remove byproduct row" title="Remove byproduct row"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></td></tr>`;
    };
    if(action==="record-result"){
      title=`Record ${kind} result`;
      fields=field("number",`${kind} reference`,"","required maxlength=200")+dateField("date",`${kind} date`)+`<label>Outcome<select class="field" name="outcome"><option>Additional tax / revision</option><option>No additional tax</option></select></label><label>Result<textarea class="field" name="text" required maxlength="2000"></textarea></label><fieldset class="case-workflow-products"><legend>Tax byproducts</legend><div class="case-workflow-product-tools"><p class="subline">One row per tax and period. Edit or remove rows before saving the BA.</p><button type="button" class="tiny-btn" data-cwf-add-product>+ Add row</button></div><div class="case-workflow-scroll"><table class="case-workflow-product-table"><thead><tr><th>Tax byproduct</th><th>Period / year</th><th>Payable (Rp)</th><th>Revise SPT</th><th><span class="case-workflow-sr-only">Remove</span></th></tr></thead><tbody data-cwf-products>${productRow("PPh Pasal 29")}</tbody></table></div><p class="subline" data-cwf-product-summary aria-live="polite"></p></fieldset>`+dateField("paymentTarget","First internal payment target")+dateField("revisionTarget","Internal revision target");
    }else if(action==="set-plan"){
      title="Set monthly instalments";
      fields=`<label>Tax byproduct<select class="field" name="productId">${w.products.filter(p=>p.amount>0).map(p=>`<option value="${esc(p.id)}">${esc(p.tax)} / ${esc(p.period)} / ${money(p.amount)}</option>`).join("")}</select></label>`+field("count","Number of instalments",3,'type="number" min="1" max="12" required')+dateField("date","First internal target")+'<p class="subline">Schedules with receipts cannot be replaced.</p>';
    }else if(action==="record-payment"||action==="verify-payment"){
      title=action==="verify-payment"?"Verify tax receipt":"Record payment";
      const receipt=w.payments.find(p=>p.id===key),row=w.schedule.find(s=>s.id===(receipt?.scheduleId||key));
      if(!row)return;
      const reserved=w.payments.filter(p=>p.scheduleId===row.id).reduce((sum,p)=>sum+p.amount,0);
      fields=(receipt?`<p>${money(receipt.amount)} / ${date(receipt.date)}</p>`:field("amount","Payment amount (Rp)",row.amount-reserved,'inputmode="numeric" required')+dateField("date","Payment date"))+field("proof","NTPN / receipt reference",receipt?.proof||"",'maxlength="200"')+(receipt?"":'<label class="case-workflow-choice"><input type="checkbox" name="verified" checked> Receipt verified</label>');
    }else{
      if(action==="record-filing"&&!s.settled||action==="record-final"&&!s.executed)return;
      title=action==="record-filing"?"Record revised SPT":action==="record-response"?"Record SPHP response":item.caseCategory==="Pemeriksaan"?"Close examination":"Record SP3P2DK & close case";
      fields=field("number",action==="record-filing"?"Submission receipt / NTTE":"Document reference","","required maxlength=200")+dateField("date","Document / submission date");
      if(action==="record-final")submit="Confirm final closure";
    }
    const dialog=document.createElement("dialog");dialog.id="case-workflow-dialog";dialog.className="case-workflow-dialog";
    dialog.setAttribute("aria-labelledby","case-workflow-dialog-title");
    dialog.innerHTML=`<form><div class="case-workflow-dialog-head"><div><div class="eyebrow">${esc(item.clientName)}</div><h3 id="case-workflow-dialog-title">${title}</h3></div><button type="button" class="ghost-btn" data-cwf-close aria-label="Close workflow dialog">Close</button></div><div class="case-workflow-fields">${fields}</div><p data-cwf-error role="alert"></p><div class="case-workflow-dialog-actions"><button type="button" class="ghost-btn" data-cwf-close>Cancel</button><button class="solid-btn" type="submit">${submit}</button></div></form>`;
    document.body.append(dialog);
    let saving=false;
    const requestId=crypto.randomUUID();
    const syncProducts=()=>{
      if(action!=="record-result")return;
      const rows=[...dialog.querySelectorAll("[data-cwf-product]")];
      const total=rows.reduce((sum,row)=>sum+(Number(row.querySelector('[name^="amount-"]').value.replaceAll(".",""))||0),0);
      dialog.querySelector("[data-cwf-product-summary]").textContent=rows.length?`${rows.length} byproduct${rows.length===1?"":"s"} / Total ${money(total)}`:"No byproducts. Add a row if tax or revision is required.";
      dialog.querySelector("[data-cwf-add-product]").disabled=rows.length>=taxCatalog.maxProducts;
      dialog.querySelector('[name="paymentTarget"]').required=rows.some(row=>Number(row.querySelector('[name^="amount-"]').value.replaceAll(".",""))>0);
      dialog.querySelector('[name="revisionTarget"]').required=rows.some(row=>row.querySelector('[name^="revise-"]').checked);
    };
    let lockedControls=[];
    const setSaving=value=>{
      saving=value;
      if(value){lockedControls=[...dialog.querySelectorAll("button,input,select,textarea")].map(control=>[control,control.disabled]);lockedControls.forEach(([control])=>control.disabled=true);}
      else{lockedControls.forEach(([control,disabled])=>control.disabled=disabled);lockedControls=[];syncProducts();}
    };
    const close=()=>{if(!saving){dialog.close();dialog.remove();}};
    dialog.querySelectorAll("[data-cwf-close]").forEach(b=>b.addEventListener("click",close));
    dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
    dialog.addEventListener("click",event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
    dialog.addEventListener("click",event=>{
      if(saving)return;
      if(event.target.closest("[data-cwf-add-product]")){
        const body=dialog.querySelector("[data-cwf-products]");if(body.children.length>=taxCatalog.maxProducts)return;
        body.insertAdjacentHTML("beforeend",productRow());syncProducts();body.lastElementChild.querySelector("select").focus();
      }
      const remove=event.target.closest("[data-cwf-remove-product]");
      if(remove){const row=remove.closest("[data-cwf-product]"),next=row.nextElementSibling||row.previousElementSibling;row.remove();syncProducts();(next?.querySelector("select")||dialog.querySelector("[data-cwf-add-product]")).focus();}
    });
    dialog.addEventListener("change",event=>{
      if(saving)return;
      if(event.target.matches('[name^="tax-"]')){
        const custom=event.target.closest("tr").querySelector(".case-workflow-custom"),other=event.target.value===taxCatalog.otherValue;
        custom.hidden=!other;custom.querySelector("input").disabled=!other;custom.querySelector("input").required=other;
        if(other)custom.querySelector("input").focus();
      }
      syncProducts();
    });
    dialog.addEventListener("input",()=>{if(!saving)syncProducts();});
    dialog.querySelector("form").addEventListener("submit",async event=>{
      event.preventDefault();if(saving)return;
      const error=dialog.querySelector("[data-cwf-error]");error.textContent="";
      try{
        const form=new FormData(event.target),command={type:action,requestId};
        for(const [name,value] of form)if(!/^(?:amount|period|revise|tax|customTax)-/.test(name))command[name]=String(value).trim();
        const iso=value=>{const m=String(value||"").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`:String(value||"");};
        for(const name of ["date","paymentTarget","revisionTarget"])if(command[name])command[name]=iso(command[name]);
        const amount=value=>{if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(String(value)))throw Error("Use a whole rupiah amount, optionally with dot thousand separators.");return Number(String(value).replaceAll(".",""));};
        if(action==="record-result")command.products=[...dialog.querySelectorAll("[data-cwf-product]")].map(row=>{const i=row.dataset.cwfProduct,tax=form.get(`tax-${i}`);return {tax,...(tax===taxCatalog.otherValue?{customTax:form.get(`customTax-${i}`)}:{}),period:form.get(`period-${i}`),amount:amount(form.get(`amount-${i}`)),revise:form.has(`revise-${i}`)};});
        if(action==="record-payment"){command.amount=amount(form.get("amount"));command.verified=form.has("verified");command.scheduleId=key;}
        if(action==="verify-payment")command.paymentId=key;
        if(action==="record-filing")command.productId=key;
        setSaving(true);
        await host.onSave(command);
        saving=false;close();
      }catch(e){error.textContent=e.message||"Not saved. Your database values are unchanged.";setSaving(false);}
    });
    syncProducts();
    dialog.showModal();
  }
  document.addEventListener("click",event=>{
    const target=event.target.closest?.("[data-cwf-case]");if(!target)return;
    const host=hosts.get(target.dataset.cwfCase);if(!host)return;
    if(target.hasAttribute('data-cwf-penalty')){host.onPenalty?.();return;}
    if(target.dataset.cwfTab){tabs.set(host.item.id,target.dataset.cwfTab);host.onRefresh();return;}
    if(target.disabled||!host.item.workflowAvailable||host.offline)return;
    const taxAction=["record-payment","verify-payment","record-filing","record-final"].includes(target.dataset.cwfAction);
    if(taxAction&&!host.canTax||host.item.stage==="Closed"&&!host.item.workflow?.examinationClosure||host.item.workflow?.final)return;
    open(host,target.dataset.cwfAction,target.dataset.cwfKey);
  });
  function matches(item,filter){
    if(!filter||filter==="all")return true;
    if(filter.startsWith('psa-'))return item.workflow?.products.some(p=>filter==='psa-ongoing'?window.CaseAssessmentUI?.ongoing(p.assessment?.psa):filter==='psa-successful'?window.CaseAssessmentUI?.success(p.assessment?.psa):p.assessment?.psa?.status==='Ditolak')||false;
    const w=item.workflow;if(!w?.result||w.final)return false;
    const s=status(w);
    if(filter==="supervisor")return s.attention;
    if(filter==="closure")return s.executed && item.caseCategory!=="Pemeriksaan";
    return filter==="overdue" && w.schedule.some(row=>row.due<today() && row.amount>w.payments.filter(p=>p.verified&&p.scheduleId===row.id).reduce((sum,p)=>sum+p.amount,0));
  }
  function bucket(item){
    const w=item.workflow;
    if(w?.examinationClosure){const s=status(w);return !s.settled?'payment':w.products.some(p=>window.CaseAssessmentUI?.ongoing(p.assessment?.psa))?'progress':'done';}
    if(w?.final||item.stage==="Closed"||item.closedAt||(!w?.result&&item.completionDate))return "done";
    if(!w?.result)return "progress";
    const s=status(w);
    return !s.settled?"payment":!s.executed?"revision":"progress";
  }
  window.CaseWorkflowUI={render,summary,status,matches,bucket};
})();
