/* Sample-only case panels. No network calls or persistent storage. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>'Rp'+Number(value||0).toLocaleString('id-ID');
  const today=()=>new Date().toISOString().slice(0,10);
  const display=value=>value?value.slice(0,10).split('-').reverse().join('/'):'-';
  let api,context=null,sequence=0;const tabs=new Map();
  const success=psa=>['Disetujui','Disetujui sebagian'].includes(psa?.status);
  const terminal=psa=>success(psa)||psa?.status==='Ditolak'||psa?.status==='Selesai';
  function ensure(audit){
    audit.notes??=[{id:`note-${audit.id}`,text:'Client data reviewed; next follow-up assigned to the case PIC.',at:'2026-11-05',actor:audit.acc||audit.tax,source:'manual',removed:false}];
    audit.tasks??=[{id:`work-${audit.id}`,title:'Prepare supporting worksheet',actor:audit.acc||audit.tax,done:false,events:[]}];
    for(const doc of audit.documents)doc.payment??={plan:[],receipts:[]};
  }
  function events(audit){return [...audit.notes,...audit.tasks.flatMap(task=>task.events.map(event=>({...event,text:`${event.done?'Completed':'Reopened'} My Work: ${task.title}`,source:'My Work',taskId:task.id})))].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));}
  function progress(audit){
    const log=events(audit),active=log.filter(entry=>!entry.removed),removed=log.filter(entry=>entry.removed);
    return `<div class="case-progress-columns"><section><h3>My Work / open work</h3><p class="muted">Linked to this case. Completing a task adds a timeline event automatically.</p><div class="linked-task-list">${audit.tasks.map(task=>`<label class="linked-task"><input type="checkbox" data-assessment-task="${esc(task.id)}" data-audit="${audit.id}" ${task.done?'checked':''}><span>${esc(task.title)}<small>${esc(task.actor)} / ${task.done?'Completed':'Open'}</small></span></label>`).join('')}</div><form data-assessment-task-form="${audit.id}" class="followup-form"><input name="title" maxlength="200" required aria-label="New linked My Work task" placeholder="Add linked My Work task..."><button class="secondary">Add task</button></form></section><section><div class="section-head"><h3>Case timeline</h3><span class="muted">${active.length} updates</span></div><div class="timeline">${active.map(entry=>`<div class="timeline-item" data-assessment-timeline="${esc(entry.id)}"><strong>${esc(entry.text)}</strong><small>${display(entry.at)} / ${esc(entry.actor)} / ${esc(entry.source)}${entry.taskId?' / '+esc(entry.taskId):''}</small>${entry.source==='manual'?`<button class="text-button" data-remove-note="${esc(entry.id)}" data-audit="${audit.id}" aria-label="Remove incorrect timeline update">Remove</button>`:''}</div>`).join('')}</div><details class="removed-updates"><summary>Removed updates (${removed.length})</summary>${removed.map(entry=>`<div class="removed-entry">${esc(entry.text)}<small>${esc(entry.actor)} / Removed as incorrect; history retained</small><button class="text-button" data-restore-note="${esc(entry.id)}" data-audit="${audit.id}">Restore</button></div>`).join('')}</details><form data-assessment-progress-form="${audit.id}" class="followup-form"><textarea name="entry" maxlength="1000" required aria-label="Add case progress" placeholder="Add a follow-up directly to this case..."></textarea><button class="secondary">Add update</button></form><p class="muted">Only manual notes can be removed here. Correct My Work, payment or closure events at their source.</p></section></div>`;
  }
  const paid=doc=>doc.payment.receipts.reduce((n,row)=>n+row.amount,0);
  const payable=doc=>doc.principal+doc.penalty;
  function payments(audit){
    if(!audit.documents.length)return '<div class="detail-empty">No SKP / STP byproducts recorded yet. Close at SPHP and register the issued documents in Progress.</div>';
    return `<div class="payment-cards">${audit.documents.map(doc=>`<section class="document-panel"><div class="document-toolbar"><div><h3>${esc(doc.type)} ${esc(doc.number||'Draft reference')}</h3><span class="muted">${esc(doc.tax)} / ${esc(doc.period)}</span></div><div class="document-actions"><span>Payable <strong>${money(payable(doc))}</strong></span><span>Paid <strong>${money(paid(doc))}</strong></span><span>Remaining <strong>${money(Math.max(0,payable(doc)-paid(doc)))}</strong></span><button class="secondary" data-assessment-plan="${doc.id}" data-audit="${audit.id}" ${doc.payment.receipts.length||!payable(doc)||!doc.number?'disabled':''}>Set instalments</button></div></div>${doc.payment.plan.length?`<table class="document-list payment-list"><thead><tr><th>No.</th><th>Internal target</th><th>Scheduled</th><th>Verified paid</th><th>Remaining</th><th>Action</th></tr></thead><tbody>${doc.payment.plan.map((part,index)=>{const settled=doc.payment.receipts.filter(r=>r.partId===part.id).reduce((n,r)=>n+r.amount,0);return `<tr><td data-label="No.">${index+1}</td><td data-label="Internal target">${display(part.date)}</td><td data-label="Scheduled">${money(part.amount)}</td><td data-label="Paid">${money(settled)}</td><td data-label="Remaining">${money(part.amount-settled)}</td><td data-label="Action">${settled===part.amount?'<span class="tag green">Paid</span>':`<button class="small-action" data-assessment-payment="${part.id}" data-doc="${doc.id}" data-audit="${audit.id}">Record payment</button>`}</td></tr>`;}).join('')}</tbody></table>`:'<div class="detail-empty">Set a single payment target or split this document into instalments.</div>'}<details class="receipt-list"><summary>Recorded receipts (${doc.payment.receipts.length})</summary>${doc.payment.receipts.map(r=>`<div class="receipt-line">${money(r.amount)} / ${display(r.date)} / ${esc(r.proof)} / Verified in demo</div>`).join('')}</details></section>`).join('')}</div><p class="workflow-note">Internal payment targets are not statutory extensions. PSA requests and decisions do not automatically change the original payable balance.</p>`;
  }
  function summary(docs){const rows=docs.filter(doc=>doc.psa);return {ongoing:rows.filter(doc=>!terminal(doc.psa)).length,successful:rows.filter(doc=>success(doc.psa)).length,rejected:rows.filter(doc=>doc.psa.status==='Ditolak').length};}
  function detail(audit,{header,identity,documents,psa}){
    ensure(audit);const active=tabs.get(audit.id)||'progress',s=summary(audit.documents);
    return header+`<div class="detail-tabs" role="tablist" aria-label="Pemeriksaan detail">${[['progress','Progress'],['payments','Payments & Instalments'],['psa',`PSA (${s.ongoing} ongoing / ${s.successful} successful)`]].map(([key,label])=>`<button type="button" data-assessment-pane="${key}" data-audit="${audit.id}" aria-selected="${active===key}">${label}</button>`).join('')}</div>`+(active==='progress'?identity+progress(audit)+documents:active==='payments'?payments(audit):`<div class="psa-overview"><strong>${s.ongoing} ongoing</strong><strong>${s.successful} successful</strong><span>${s.rejected} rejected</span><button class="text-button" data-go-penalty="${audit.id}">Open in Penalty Removal &#8594;</button></div>`+(audit.documents.some(doc=>doc.psa)?psa:'<div class="detail-empty">No documents routed to PSA yet. Select SKP / STP documents in Progress or in the register.</div>'));
  }
  function record(audit,text){ensure(audit);audit.notes.unshift({id:`action-${++sequence}`,text,at:new Date().toISOString(),actor:audit.tax||audit.acc||'Demo PIC',source:'Case action'});}
  function open(kind,audit,doc,partId){
    ensure(audit);context={kind,auditId:audit.id,docId:doc.id,partId};const dialog=document.getElementById('assessment-action-dialog');
    const input=(name,label,value,extra='')=>`<label>${label}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
    const part=doc.payment.plan.find(p=>p.id===partId),remaining=part?part.amount-doc.payment.receipts.filter(r=>r.partId===partId).reduce((n,r)=>n+r.amount,0):0;
    document.getElementById('assessment-action-title').textContent=kind==='plan'?'Set instalments':kind==='payment'?'Record verified payment':'Record PSA decision';
    document.getElementById('assessment-action-fields').innerHTML=`<p class="muted">${esc(doc.type)} ${esc(doc.number)} / ${esc(audit.client)}</p>`+(kind==='plan'?input('count','Number of monthly instalments','3','type="number" min="1" max="36"')+input('date','First internal target (dd/mm/yyyy)',display(today())):kind==='payment'?input('amount','Amount paid (whole rupiah)',remaining,'inputmode="numeric"')+input('date','Payment date (dd/mm/yyyy)',display(today()))+input('proof','NTPN / payment proof',''):'<label>Decision<select name="outcome"><option>Disetujui</option><option>Disetujui sebagian</option><option>Ditolak</option></select></label>'+input('amount','Reduction granted (whole rupiah)',doc.psa.decision?.amount??doc.psa.requested,'inputmode="numeric"')+input('proof','Decision reference',doc.psa.decision?.proof||'')+input('date','Decision date (dd/mm/yyyy)',display(doc.psa.decision?.date||today())));
    const readOnly=kind==='decision'&&Boolean(doc.psa.decision);
    if(kind==='decision'&&doc.psa.decision)document.querySelector('#assessment-action-fields [name="outcome"]').value=doc.psa.status;
    document.querySelectorAll('#assessment-action-fields input,#assessment-action-fields select').forEach(input=>{input.disabled=readOnly;});
    document.querySelector('#assessment-action-form button.primary').hidden=readOnly;
    document.getElementById('assessment-action-error').textContent='';dialog.showModal();
  }
  function configure(config){
    api=config;
    if(document.getElementById('assessment-action-dialog'))return;
    const dialog=document.createElement('dialog');dialog.id='assessment-action-dialog';dialog.innerHTML='<form id="assessment-action-form" novalidate><div class="dialog-head"><h2 id="assessment-action-title"></h2><button type="button" class="icon-button" data-close-assessment-action aria-label="Cancel">&#215;</button></div><div id="assessment-action-fields" class="action-fields"></div><p id="assessment-action-error" class="form-error" role="alert"></p><p class="muted">Preview only. No payment or application is submitted.</p><div class="dialog-actions"><button type="button" class="secondary" data-close-assessment-action>Cancel</button><button class="primary">Save in demo</button></div></form>';document.body.append(dialog);
    document.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-close-assessment-action')){dialog.close();context=null;return;}
      const audit=api.getAudit(button.dataset.audit);
      if(button.dataset.assessmentPane&&audit){tabs.set(audit.id,button.dataset.assessmentPane);api.clearSelection();api.render();return;}
      if(button.dataset.goPenalty){api.openPenalty(button.dataset.goPenalty);return;}
      if(!audit)return;ensure(audit);
      if(button.dataset.removeNote||button.dataset.restoreNote){const note=audit.notes.find(row=>row.id===(button.dataset.removeNote||button.dataset.restoreNote));if(note?.source==='manual'){note.removed=Boolean(button.dataset.removeNote);note.removedAt=note.removed?new Date().toISOString():null;api.render();api.message(note.removed?'Manual update removed. Restore it from Removed updates.':'Manual update restored.');}return;}
      const doc=audit.documents.find(row=>row.id===(button.dataset.assessmentPlan||button.dataset.doc||button.dataset.psaDecision));
      if(button.dataset.assessmentPlan&&doc){if(doc.payment.receipts.length)return;open('plan',audit,doc);}
      if(button.dataset.assessmentPayment&&doc)open('payment',audit,doc,button.dataset.assessmentPayment);
      if(button.dataset.psaDecision&&doc?.psa){if(!doc.psa.decision&&(!doc.psa.application.trim()||!doc.psa.date||doc.psa.status==='Draft'))return api.message('Record the application reference, date and submitted progress before its decision.');open('decision',audit,doc);}
    });
    document.addEventListener('change',event=>{
      const input=event.target;if(!input.dataset.assessmentTask)return;const audit=api.getAudit(input.dataset.audit);if(!audit)return;ensure(audit);const task=audit.tasks.find(row=>row.id===input.dataset.assessmentTask);if(!task||task.done===input.checked)return;
      task.done=input.checked;task.events.push({id:`work-event-${++sequence}`,at:new Date().toISOString(),actor:task.actor,done:task.done});api.render();api.message('My Work status and case timeline updated together in this preview.');
    });
    document.addEventListener('submit',event=>{
      const form=event.target;if(!form.dataset.assessmentTaskForm&&!form.dataset.assessmentProgressForm)return;event.preventDefault();const audit=api.getAudit(form.dataset.assessmentTaskForm||form.dataset.assessmentProgressForm);if(!audit)return;ensure(audit);
      const data=new FormData(form),text=String(data.get(form.dataset.assessmentTaskForm?'title':'entry')||'').trim();if(!text)return;
      if(form.dataset.assessmentTaskForm)audit.tasks.push({id:`work-${++sequence}`,title:text.slice(0,200),actor:audit.tax||audit.acc||'Demo PIC',done:false,events:[]});
      else audit.notes.unshift({id:`manual-${++sequence}`,text:text.slice(0,1000),at:new Date().toISOString(),actor:audit.tax||audit.acc||'Demo PIC',source:'manual',removed:false});api.render();
    });
    document.getElementById('assessment-action-form').addEventListener('submit',event=>{
      event.preventDefault();if(!context)return;const audit=api.getAudit(context.auditId),doc=audit?.documents.find(row=>row.id===context.docId);if(!doc)return;ensure(audit);
      const data=new FormData(event.target),date=api.parseDate(String(data.get('date')||'').trim()),raw=String(data.get('amount')||'').trim(),amount=/^\d+(?:\.\d{3})*$/.test(raw)?Number(raw.replaceAll('.','')):NaN,proof=String(data.get('proof')||'').trim(),fail=text=>{document.getElementById('assessment-action-error').textContent=text;};
      if(!date)return fail('Enter a valid dd/mm/yyyy date.');
      if(context.kind==='plan'){
        const count=Number(data.get('count')),total=payable(doc);if(doc.payment.receipts.length)return fail('Payments already exist; a correction workflow is required.');
        if(!Number.isInteger(count)||count<1||count>36||total<count||!Number.isSafeInteger(total))return fail('Choose 1 to 36 instalments, each at least Rp1.');
        const start=new Date(date+'T00:00:00Z'),day=start.getUTCDate(),base=Math.floor(total/count);
        doc.payment.plan=Array.from({length:count},(_,index)=>{const next=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+index,1));next.setUTCDate(Math.min(day,new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate()));return {id:`part-${++sequence}`,date:next.toISOString().slice(0,10),amount:index===count-1?total-base*(count-1):base};});record(audit,`Internal payment plan: ${count} instalments for ${doc.number}.`);
      }else if(context.kind==='payment'){
        const part=doc.payment.plan.find(row=>row.id===context.partId);if(!part)return fail('Payment target no longer exists.');const remaining=part.amount-doc.payment.receipts.filter(row=>row.partId===part.id).reduce((n,row)=>n+row.amount,0);
        if(!proof||!Number.isSafeInteger(amount)||amount<=0||amount>remaining)return fail('Enter payment proof and an amount within the remaining balance.');
        doc.payment.receipts.push({id:`receipt-${++sequence}`,partId:part.id,date,amount,proof});record(audit,`Verified payment ${money(amount)} for ${doc.number}; proof ${proof}.`);
      }else{
        if(doc.psa?.decision)return fail('This decision is recorded. Corrections require retained history.');
        const outcome=String(data.get('outcome')),requested=doc.psa.requested;
        if(!['Disetujui','Disetujui sebagian','Ditolak'].includes(outcome)||!proof||!Number.isSafeInteger(amount)||amount<0||amount>requested||outcome==='Ditolak'&&amount!==0||outcome==='Disetujui'&&amount!==requested||outcome==='Disetujui sebagian'&&!(amount>0&&amount<requested))return fail('Enter decision proof and an amount matching the decision (rejected: 0; partial: between 0 and requested).');
        doc.psa.status=outcome;doc.psa.decision={date,proof,amount};record(audit,`PSA ${outcome}: ${doc.number}, granted reduction ${money(amount)}; ${proof}.`);
      }
      dialog.close();context=null;api.render();api.message('Recorded in the demo. Source references and original assessment remain linked.');
    });
  }
  window.AssessmentPanels={configure,detail,record,ensure,summary,success,terminal,pane:audit=>tabs.get(audit.id)||'progress',reset:()=>tabs.clear()};
})();
