(() => {
  'use strict';
  const hosts=new Map(),selected=new Map(),busy=new Set(),drafts=new Map();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>Number(value||0).toLocaleString('id-ID');
  const date=value=>value?value.slice(0,10).split('-').reverse().join('/'):'-';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const iso=value=>{const m=String(value||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:String(value||'').trim();};
  const amount=value=>{const raw=String(value??'').trim();if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(raw)||!Number.isSafeInteger(Number(raw.replaceAll('.',''))))throw Error('Use a non-negative whole-rupiah amount.');return Number(raw.replaceAll('.',''));};
  const success=psa=>['Disetujui','Disetujui sebagian'].includes(psa?.status);
  const ongoing=psa=>Boolean(psa)&&!['Disetujui','Disetujui sebagian','Ditolak'].includes(psa.status);
  const action=(item,type,label,key='',disabled=false,iconOnly=false)=>`<button type="button" class="tiny-btn${iconOnly?' case-progress-remove':''}" ${iconOnly?`aria-label="${esc(label)}" title="${esc(label)}"`:''} data-ca-case="${esc(item.id)}" data-ca-action="${type}" data-ca-key="${esc(key)}" ${disabled?'disabled':''}>${iconOnly?'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>':esc(label)}</button>`;
  const count=items=>{const docs=items.flatMap(item=>item.workflow?.products||[]).filter(p=>p.assessment);return {documents:docs.length,psa:docs.filter(p=>p.assessment.psa).length,ongoing:docs.filter(p=>ongoing(p.assessment.psa)).length,successful:docs.filter(p=>success(p.assessment.psa)).length,rejected:docs.filter(p=>p.assessment.psa?.status==='Ditolak').length};};
  function scopedProducts(item,mode,query='',filter='all'){
    const parentMatches=[item.clientName,item.letterNumber,item.taxPic,item.accountingPic,item.taxYear,item.subject,item.notes,item.inspectorPic,item.completionNotes,item.workflow?.examinationClosure?.number].join(' ').toLowerCase().includes(query.toLowerCase());
    return (item.workflow?.products||[]).filter(p=>mode!=='psa'||p.assessment?.psa).filter(p=>!query||parentMatches||[p.tax,p.period,p.assessment?.number,p.assessment?.psa?.application].join(' ').toLowerCase().includes(query.toLowerCase())).filter(p=>filter==='psa-ongoing'?ongoing(p.assessment?.psa):filter==='psa-successful'?success(p.assessment?.psa):filter==='psa-rejected'?p.assessment?.psa?.status==='Ditolak':true);
  }
  function input(item,p,key,value,disabled=false,numeric=false){return `<input class="field case-assessment-cell" data-ca-edit="${key}" data-ca-case="${esc(item.id)}" data-ca-key="${esc(p.id)}" aria-label="${esc(key)}: ${esc(p.assessment.number)}" value="${esc(numeric?money(value):value)}" ${numeric?'inputmode="numeric"':''} ${disabled?'disabled':''}>`;}
  function draftRows(item){
    return (drafts.get(item.id)||[]).map(draft=>{
      const locked=busy.has(`${item.id}:${draft.requestId}`),cell=(key,label,numeric=false)=>`<td data-label="${label}"><input class="field case-assessment-cell" data-ca-draft-field="${key}" data-ca-case="${esc(item.id)}" data-ca-key="${draft.requestId}" aria-label="New assessment ${label}" value="${esc(draft[key])}" ${numeric?'inputmode="numeric"':''} ${locked?'disabled':''}></td>`;
      return `<tr class="case-assessment-draft" data-ca-draft="${draft.requestId}"><td data-label="Draft"><span class="pill warning">Draft</span></td><td data-label="Type"><select class="field" data-ca-draft-field="kind" data-ca-case="${esc(item.id)}" data-ca-key="${draft.requestId}" ${locked?'disabled':''}><option ${draft.kind==='SKP'?'selected':''}>SKP</option><option ${draft.kind==='STP'?'selected':''}>STP</option></select></td>${cell('tax','Tax')}${cell('period','Period')}${cell('number','Assessment reference')}${cell('date','Issue date')}${cell('principal','Principal (Rp)',true)}${cell('penalty','Penalty (Rp)',true)}<td data-label="Save draft">${action(item,'save-draft',locked?'Saving...':'Save new row',draft.requestId,locked)}${action(item,'discard-draft','Cancel draft',draft.requestId,locked)}<span class="subline">Not saved yet. Initial payment target uses issue date; adjust it in Payments.</span></td></tr>`;
    }).join('');
  }
  function documents(item,host,mode='register',products=null){
    hosts.set(item.id,{item,...host});const w=item.workflow||{},psaMode=mode==='psa',canEdit=host.canManage&&!host.offline&&item.workflowAvailable&&Boolean(w.examinationClosure)&&!w.final;
    const rows=products||(w.products||[]).filter(p=>!psaMode||p.assessment?.psa),ids=new Set(rows.map(p=>p.id));
    const chosen=selected.get(item.id)||new Set();for(const id of chosen)if(!ids.has(id))chosen.delete(id);selected.set(item.id,chosen);
    const eligible=rows.filter(p=>p.assessment&&(psaMode?p.assessment.psa?.status==='Draft':!p.assessment.psa&&p.assessment.penalty>0));
    const cell=(label,html)=>`<td data-label="${label}">${html}</td>`;
    const header=psaMode?['Select','Source SKP / STP','Tax / period','Penalty (Rp)','Requested (Rp)','Application','Progress','Decision']:['Select','Type','Tax','Period','Assessment reference','Issue date','Principal (Rp)','Penalty (Rp)','PSA'];
    const select=p=>`<input type="checkbox" data-ca-select="${esc(p.id)}" data-ca-case="${esc(item.id)}" aria-label="Select ${esc(p.assessment?.number||p.tax)}" ${chosen.has(p.id)?'checked':''} ${host.canTax&&canEdit&&eligible.includes(p)?'':'disabled'}>`;
    return `<section class="case-workflow-block case-assessment-documents"><div class="case-assessment-heading"><div><h4>${psaMode?'Pengurangan Sanksi Administrasi':'SKP & STP documents'}</h4><p class="subline">${psaMode?'Shared applications; decisions do not automatically change the original liability.':'Edit document cells directly. Original payment references remain linked.'}</p></div><div class="inline-controls">${psaMode?'':action(item,'add-SKP','+ SKP','',!canEdit)+action(item,'add-STP','+ STP','',!canEdit)}${action(item,psaMode?'psa-return':'psa-route',psaMode?'Return selected draft':'Move selected to PSA','',!canEdit||!host.canTax||!chosen.size)}</div></div>
      <div class="case-assessment-table-wrap"><table class="case-assessment-table"><thead><tr>${header.map((label,index)=>`<th>${index===0?`<input type="checkbox" data-ca-select-all="${esc(item.id)}" aria-label="Select all eligible documents" ${eligible.length&&eligible.every(p=>chosen.has(p.id))?'checked':''} ${host.canTax&&canEdit&&eligible.length?'':'disabled'}>`:label}</th>`).join('')}</tr></thead><tbody>${rows.map(p=>{
        const a=p.assessment;if(!a)return `<tr>${cell('Select','')}${cell('Legacy byproduct',`<strong>${esc(p.tax)} / ${esc(p.period)}</strong>`)}<td colspan="${header.length-2}">Legacy result: Rp${money(p.amount)}. ${action(item,'classify','Classify existing liability',p.id,!canEdit)}<span class="subline">Classifying preserves its amount, instalments and receipts; it does not add a second liability.</span></td></tr>`;
        const locked=!canEdit||busy.has(`${item.id}:${p.id}`)||a.psa&&a.psa.status!=='Draft'||(w.payments||[]).some(receipt=>(w.schedule||[]).some(s=>s.productId===p.id&&s.id===receipt.scheduleId)),psa=a.psa;
        if(psaMode)return `<tr data-ca-document="${esc(p.id)}">${cell('Select',select(p))}${cell('Source SKP / STP',`<strong>${esc(a.type)} ${esc(a.number)}</strong>`)}${cell('Tax / period',`${esc(p.tax)} / ${esc(p.period)}`)}${cell('Penalty (Rp)',money(a.penalty))}${cell('Requested (Rp)',money(psa.requested))}${cell('Application',`${esc(psa.application||'Not submitted')}<span class="subline">${date(psa.date)}</span>${action(item,'psa-edit','Edit request',p.id,!canEdit||!host.canTax||Boolean(psa.decision))}`)}${cell('Progress',`<span class="pill ${success(psa)?'accent':ongoing(psa)?'warning':'neutral'}">${esc(psa.status)}</span>`)}${cell('Decision',psa.decision?`${esc(psa.decision.number)}<span class="subline">${date(psa.decision.date)} / Granted Rp${money(psa.decision.amount)}</span>`:action(item,'psa-decision','Record decision',p.id,!canEdit||!host.canTax||psa.status==='Draft'))}</tr>`;
        return `<tr data-ca-document="${esc(p.id)}">${cell('Select',select(p))}${cell('Type',`<select class="field case-assessment-cell" data-ca-edit="kind" data-ca-case="${esc(item.id)}" data-ca-key="${esc(p.id)}" ${locked?'disabled':''}><option ${a.type==='SKP'?'selected':''}>SKP</option><option ${a.type==='STP'?'selected':''}>STP</option></select>`)}${cell('Tax',input(item,p,'tax',p.tax,locked))}${cell('Period',input(item,p,'period',p.period,locked))}${cell('Assessment reference',input(item,p,'number',a.number,locked))}${cell('Issue date',input(item,p,'date',date(a.date),locked))}${cell('Principal (Rp)',input(item,p,'principal',a.principal,locked,true))}${cell('Penalty (Rp)',input(item,p,'penalty',a.penalty,locked,true))}${cell('PSA',psa?`<span class="pill accent">${esc(psa.status)}</span>`:'Not routed')}</tr>`;
      }).join('')||`<tr><td colspan="${header.length}"><p class="subline">${psaMode?'No linked PSA applications. Select SKP / STP documents and move them to PSA.':'No assessments yet. Add issued SKP / STP now or later.'}</p></td></tr>`}${psaMode?'':draftRows(item)}</tbody></table></div></section>`;
  }
  function registry(items,{mode,expanded,hostFor,numberFor,query='',filter='all',sort={key:'createdAt',direction:'asc'}}){
    const columns=[['_number','No.'],['clientName','Wajib Pajak'],['letterNumber','Pemeriksaan / SPHP'],['taxYear','Tax year'],['accountingPic','ACC PIC'],['taxPic','Tax PIC'],['documents','Documents'],['assessmentTotal',mode==='psa'?'Requested (Rp)':'Payable (Rp)'],['assessmentStatus','Control status']];
    return `<div class="table-wrap" data-case-assessment-viewport tabindex="0" aria-label="${mode==='psa'?'Penalty Removal':'SKP & STP'} control"><table class="case-sheet case-assessment-register"><colgroup>${columns.map(([key])=>`<col data-case-column="${key}" style="width:${key==='clientName'?220:key==='_number'?44:150}px">`).join('')}</colgroup><thead><tr>${columns.map(([key,label])=>{const field=key==='_number'?'createdAt':key,active=sort.key===field;return `<th aria-sort="${active?(sort.direction==='asc'?'ascending':'descending'):'none'}"><button class="case-sheet-sort" data-case-sheet-sort="${field}">${label}<span aria-hidden="true">${active?(sort.direction==='asc'?'&#8593;':'&#8595;'):'&#8597;'}</span></button>${key==='_number'?'':`<span class="case-sheet-column-resize" data-case-resize="${key}" role="separator" aria-orientation="vertical" aria-valuemin="72" aria-valuemax="640" aria-label="Resize ${label}" tabindex="0"></span>`}</th>`;}).join('')}</tr></thead><tbody>${items.map(item=>{
      const rows=scopedProducts(item,mode,query,filter);
      const s=count([{workflow:{products:rows}}]),open=expanded===item.id,value=rows.reduce((n,p)=>n+(mode==='psa'?p.assessment.psa.requested:p.amount),0);
      return `<tr class="case-main-row" data-case-sheet-row="${esc(item.id)}"><td><button class="case-sheet-row-toggle" data-toggle-himbauan-progress="${esc(item.id)}" aria-expanded="${open}"><span>${numberFor(item.id)}</span><span aria-hidden="true">${open?'&#9662;':'&#9656;'}</span></button></td><td><strong>${esc(item.clientName)}</strong></td><td>${esc(item.letterNumber||'-')}<span class="subline">${esc(item.workflow?.examinationClosure?.number||'Legacy result')}</span></td><td>${esc(item.taxYear||'-')}</td><td>${esc(item.accountingPic||'No PIC')}</td><td>${esc(item.taxPic||'No PIC')}</td><td>${rows.length}</td><td>Rp${money(value)}</td><td>${mode==='psa'?`${s.ongoing} ongoing / ${s.successful} successful / ${s.rejected} rejected`:s.psa?`${s.psa} in PSA`:rows.length?'Registered':'Awaiting documents'}</td></tr>${open?`<tr class="case-progress-inline" data-case-progress-id="${esc(item.id)}"><td colspan="9"><div class="case-progress-viewport">${documents(item,hostFor(item),mode,rows)}</div></td></tr>`:''}`;
    }).join('')||'<tr><td colspan="9"><div class="empty-state">No linked assessments match these filters.</div></td></tr>'}</tbody></table></div>`;
  }
  const field=(name,label,value='',extra='')=>`<label>${esc(label)}<input class="field" name="${name}" value="${esc(value)}" ${extra}></label>`;
  const dates=(name,label,value=today(),optional=false)=>field(name,label,date(value)==='-'?'':date(value),`placeholder="dd/mm/yyyy" ${optional?'':'required'}`);
  function assessmentFields(item,kind,p=null,prefix=''){
    const a=p?.assessment;
    return `<label>Type<select class="field" name="${prefix}kind"><option ${kind==='SKP'?'selected':''}>SKP</option><option ${kind==='STP'?'selected':''}>STP</option></select></label>`+field(prefix+'tax','Tax type',p?.tax||'PPN','required maxlength=80')+field(prefix+'period','Period / year',p?.period||item.taxYear||'','required maxlength=40')+field(prefix+'number','SKP / STP reference',a?.number||'','required maxlength=200')+dates(prefix+'date','Issue date',a?.date||today())+field(prefix+'principal','Principal (Rp)',money(a?.principal??p?.amount??0),'inputmode="numeric" required')+field(prefix+'penalty','Penalty (Rp)',money(a?.penalty||0),'inputmode="numeric" required')+dates(prefix+'paymentTarget','First internal payment target');
  }
  function assessmentCommand(form,prefix=''){const value=name=>String(form.get(prefix+name)||'').trim();return {kind:value('kind'),tax:value('tax'),period:value('period'),number:value('number'),date:iso(value('date')),principal:amount(value('principal')),penalty:amount(value('penalty')),paymentTarget:iso(value('paymentTarget'))};}
  function open(host,type,key){
    document.getElementById('case-assessment-dialog')?.remove();const {item}=host,w=item.workflow||{},p=w.products?.find(p=>p.id===key),psa=p?.assessment?.psa;
    let fields='',title='',staged=0;
    if(type==='close-examination'){title='Record SPHP & close examination';fields=field('number','SPHP No.','','required maxlength=200')+dates('date','SPHP date (optional)',item.sphpDate||'',true)+'<p class="subline">This closes the examination stage only. Payments and PSA stay active. Add issued byproducts now, or record them later.</p><div class="case-assessment-stage-tools"><button type="button" class="tiny-btn" data-ca-stage="SKP">+ SKP</button><button type="button" class="tiny-btn" data-ca-stage="STP">+ STP</button></div><div data-ca-staged></div>';}
    else if(type==='add-SKP'||type==='add-STP'||type==='classify'){title=type==='classify'?'Classify existing liability':`Register ${type.slice(4)}`;fields=assessmentFields(item,type==='add-STP'?'STP':'SKP',p);}
    else if(type==='psa-edit'&&psa){title='Edit PSA request';const locked=psa.status!=='Draft';fields=field('requested','Requested reduction (Rp)',money(psa.requested),`inputmode="numeric" ${locked?'readonly':''}`)+field('application','Application reference',psa.application,`maxlength=200 ${locked?'readonly':''}`)+dates('date','Application date',psa.date||'',true)+`<label>Progress<select class="field" name="status">${['Draft','Diajukan','Dalam proses'].filter(status=>!locked||status!=='Draft').map(status=>`<option ${psa.status===status?'selected':''}>${status}</option>`).join('')}</select></label><label>Notes<textarea class="field" name="note" maxlength="1000">${esc(psa.note)}</textarea></label>`;}
    else if(type==='psa-decision'&&psa){title='Record PSA decision';fields=`<label>Decision<select class="field" name="outcome"><option>Disetujui</option><option>Disetujui sebagian</option><option>Ditolak</option></select></label>`+field('amount','Reduction granted (Rp)',money(psa.requested),'inputmode="numeric" required')+field('number','Decision reference','','required maxlength=200')+dates('date','Decision date');}
    else if(type==='remove-progress'){title='Remove incorrect follow-up';fields='<p class="subline">The original entry and removal history will be retained. You can restore it later. My Work and financial events must be corrected at their source.</p><label>Reason<textarea class="field" name="reason" maxlength="500" required></textarea></label>';}
    else if(type==='restore-progress'){title='Restore follow-up';fields='<p class="subline">Restore this retained manual follow-up to the timeline?</p>';}
    else if(type==='psa-route'||type==='psa-return'){title=type==='psa-route'?'Move selected documents to PSA':'Return draft requests';const ids=selected.get(item.id)||new Set();if(!ids.size)return;fields=`<p class="subline">${ids.size} selected document(s). Original liabilities and receipts stay linked and are not removed.</p>`;}
    else return;
    const dialog=document.createElement('dialog');dialog.id='case-assessment-dialog';dialog.className='case-workflow-dialog';dialog.setAttribute('aria-label',title);
    dialog.innerHTML=`<form novalidate><div class="case-workflow-dialog-head"><div><div class="eyebrow">${esc(item.clientName)}</div><h3>${title}</h3></div><button type="button" class="ghost-btn" data-ca-close>Close</button></div><div class="case-workflow-fields">${fields}</div><p data-ca-error role="alert"></p><div class="case-workflow-dialog-actions"><button type="button" class="ghost-btn" data-ca-close>Cancel</button><button class="solid-btn">Save to database</button></div></form>`;document.body.append(dialog);
    let saving=false,requestId=crypto.randomUUID(),lastPayload='';
    const close=()=>{if(!saving){dialog.close();dialog.remove();}};
    dialog.querySelectorAll('[data-ca-close]').forEach(b=>b.onclick=close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('click',event=>{
      const add=event.target.closest('[data-ca-stage]');if(add){if(!dialog.querySelector('[name="number"]').value.trim()){dialog.querySelector('[data-ca-error]').textContent='Enter SPHP No. first.';return;}const section=document.createElement('fieldset');section.className='case-assessment-staged';section.dataset.stageIndex=staged;section.innerHTML=`<legend>Byproduct ${staged+1}</legend><div class="case-workflow-fields">${assessmentFields(item,add.dataset.caStage,null,`stage-${staged}-`)}</div><button class="tiny-btn" type="button" data-ca-discard-stage>Remove draft</button>`;dialog.querySelector('[data-ca-staged]').append(section);staged++;}
      if(event.target.closest('[data-ca-discard-stage]'))event.target.closest('fieldset').remove();
      if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}
    });
    dialog.querySelector('form').addEventListener('submit',async event=>{
      event.preventDefault();if(saving)return;const error=dialog.querySelector('[data-ca-error]');error.textContent='';
      try{
        const form=new FormData(event.target);let command={type,requestId};
        for(const [name,value]of form)if(!name.startsWith('stage-'))command[name]=String(value).trim();
        if(command.date)command.date=iso(command.date);
        if(type==='close-examination')command.assessments=[...dialog.querySelectorAll('[data-stage-index]')].map(el=>assessmentCommand(form,`stage-${el.dataset.stageIndex}-`));
        if(type.startsWith('add-')||type==='classify')command={...command,...assessmentCommand(form),type:'record-assessment',...(p?{productId:p.id}:{})};
        if(type==='psa-edit'){command.productId=key;command.requested=amount(form.get('requested'));}
        if(type==='psa-decision'){command.productId=key;command.amount=amount(form.get('amount'));}
        if(type==='psa-route'||type==='psa-return')command.productIds=[...(selected.get(item.id)||[])];
        if(type==='remove-progress'||type==='restore-progress')command.entryId=key;
        const payload=JSON.stringify({...command,requestId:undefined});if(lastPayload&&payload!==lastPayload)command.requestId=requestId=crypto.randomUUID();lastPayload=payload;
        saving=true;dialog.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);await host.onSave(command);
        if(type==='psa-route'||type==='psa-return')selected.delete(item.id);saving=false;close();host.onRefresh();
      }catch(e){saving=false;dialog.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);error.textContent=e.message||'Not saved. Please retry.';}
    });dialog.showModal();
  }
  document.addEventListener('click',async event=>{
    const target=event.target.closest?.('[data-ca-action]');if(!target||target.disabled)return;const host=hosts.get(target.dataset.caCase);if(!host||host.offline||!host.item.workflowAvailable||!host.canManage)return;
    const type=target.dataset.caAction,id=target.dataset.caKey,rows=drafts.get(host.item.id)||[];
    if(type==='add-SKP'||type==='add-STP'){rows.push({requestId:crypto.randomUUID(),kind:type.slice(4),tax:'PPN',period:host.item.taxYear||'',number:'',date:date(today()),principal:'0',penalty:'0'});drafts.set(host.item.id,rows);host.onRefresh();return;}
    if(type==='discard-draft'){drafts.set(host.item.id,rows.filter(row=>row.requestId!==id));host.onRefresh();return;}
    if(type==='save-draft'){
      const draft=rows.find(row=>row.requestId===id),key=`${host.item.id}:${id}`;if(!draft||busy.has(key))return;
      target.closest('tr').querySelectorAll('[data-ca-draft-field]').forEach(input=>{draft[input.dataset.caDraftField]=input.value;});
      try{
        const command={...draft,type:'record-assessment',date:iso(draft.date),principal:amount(draft.principal),penalty:amount(draft.penalty),paymentTarget:iso(draft.date)};
        busy.add(key);target.closest('tr').querySelectorAll('input,select,button').forEach(input=>input.disabled=true);await host.onSave(command);drafts.set(host.item.id,(drafts.get(host.item.id)||[]).filter(row=>row.requestId!==id));
      }catch(e){host.onError?.(`Draft not saved: ${e.message||'Please retry.'}`);}finally{busy.delete(key);host.onRefresh();}return;
    }
    open(host,type,id);
  });
  function updateDraft(target){const draft=(drafts.get(target.dataset.caCase)||[]).find(row=>row.requestId===target.dataset.caKey);if(draft&&target.dataset.caDraftField)draft[target.dataset.caDraftField]=target.value;}
  document.addEventListener('input',event=>{if(event.target.dataset.caDraftField)updateDraft(event.target);});
  document.addEventListener('change',async event=>{
    const target=event.target,host=hosts.get(target.dataset.caCase||target.dataset.caSelectAll);if(!host)return;
    if(target.dataset.caDraftField){updateDraft(target);return;}
    if(target.dataset.caSelect||target.dataset.caSelectAll){const ids=selected.get(host.item.id)||new Set();if(target.dataset.caSelect)target.checked?ids.add(target.dataset.caSelect):ids.delete(target.dataset.caSelect);else target.closest('table').querySelectorAll('[data-ca-select]:not(:disabled)').forEach(input=>target.checked?ids.add(input.dataset.caSelect):ids.delete(input.dataset.caSelect));selected.set(host.item.id,ids);host.onRefresh();return;}
    if(!target.dataset.caEdit||host.offline||!host.canManage)return;
    const p=host.item.workflow?.products.find(p=>p.id===target.dataset.caKey),a=p?.assessment,key=`${host.item.id}:${p?.id}`;if(!a||busy.has(key))return;
    try{
      const command={type:'edit-assessment',requestId:crypto.randomUUID(),productId:p.id,kind:a.type,tax:p.tax,period:p.period,number:a.number,date:a.date,principal:a.principal,penalty:a.penalty,paymentTarget:host.item.workflow.schedule.find(s=>s.productId===p.id)?.due||today()};
      command[target.dataset.caEdit]=['principal','penalty'].includes(target.dataset.caEdit)?amount(target.value):target.dataset.caEdit==='date'?iso(target.value):target.value.trim();
      const original=target.dataset.caEdit==='kind'?a.type:['tax','period'].includes(target.dataset.caEdit)?p[target.dataset.caEdit]:a[target.dataset.caEdit];
      if(command[target.dataset.caEdit]===original)return;
      busy.add(key);target.closest('tr').querySelectorAll('input,select').forEach(input=>input.disabled=true);await host.onSave(command);
    }catch(e){host.onError?.(e.message||'Assessment not saved.');}finally{busy.delete(key);host.onRefresh();}
  });
  const hasDrafts=id=>id?Boolean(drafts.get(id)?.length):[...drafts.values()].some(rows=>rows.length);
  window.addEventListener('beforeunload',event=>{if(hasDrafts()){event.preventDefault();event.returnValue='';}});
  window.CaseAssessmentUI={documents,registry,count,scopedProducts,ongoing,success,hasDrafts,registerHost:(item,host)=>hosts.set(item.id,{item,...host}),action,open};
})();
