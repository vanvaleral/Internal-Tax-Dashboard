(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => Number(value || 0).toLocaleString('id-ID');
  const sum = (rows,field) => rows.reduce((total,row) => total + Number(row[field] || 0),0);
  const displayDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
  function parseDate(value) {
    if (!value) return '';
    const dayFirst = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/), iso = dayFirst ? `${dayFirst[3]}-${dayFirst[2].padStart(2,'0')}-${dayFirst[1].padStart(2,'0')}` : value;
    const parsed = new Date(`${iso}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === iso ? iso : null;
  }
  let sequence = 100, tab = 'examination', expanded = 'audit-3', selected = new Set(), sortDirection = 1, sorted = false, pendingMove = [], pendingClosure = null;
  const initial = [
    {id:'audit-1',client:'PT Arunika Nusantara',audit:'PEM/DEMO/001',year:'2024',acc:'Cemari',tax:'Bagus',sphp:'SPHP/DEMO/001',sphpDate:'2026-10-15',closed:true,documents:[
      {id:'doc-1',type:'SKP',tax:'PPh 29',period:'2024',number:'00001/206/24/DEMO',date:'2026-10-20',principal:18000000,penalty:3600000,psa:null},
      {id:'doc-2',type:'SKP',tax:'PPN',period:'12/2024',number:'00002/207/24/DEMO',date:'2026-10-20',principal:12500000,penalty:2500000,psa:null},
      {id:'doc-3',type:'STP',tax:'PPh 21',period:'01-12/2024',number:'00003/103/24/DEMO',date:'2026-10-22',principal:0,penalty:1200000,psa:null}]},
    {id:'audit-2',client:'CV Sagara Karya',audit:'PEM/DEMO/002',year:'2024',acc:'Dina',tax:'Harry',sphp:'SPHP/DEMO/002',sphpDate:'2026-10-18',closed:true,documents:[
      {id:'doc-4',type:'STP',tax:'PPN',period:'11/2024',number:'00004/107/24/DEMO',date:'2026-10-25',principal:0,penalty:2000000,psa:{requested:2000000,application:'PSA/DEMO/001',date:'2026-11-03',status:'Draft',note:'Prepare supporting explanation.'}},
      {id:'doc-5',type:'SKP',tax:'PPh 23',period:'2024',number:'00005/203/24/DEMO',date:'2026-10-25',principal:4500000,penalty:900000,psa:null}]},
    {id:'audit-3',client:'I Made Darma (sample)',audit:'PEM/DEMO/003',year:'2025',acc:'',tax:'Ita',sphp:'',sphpDate:'',closed:false,documents:[]}
  ];
  let audits = structuredClone(initial);
  const allDocs = () => audits.flatMap(audit => audit.documents);
  const findDoc = id => allDocs().find(doc => doc.id === id);
  function message(text) { $('assessment-message').textContent = text; }
  function options(values,value) { return values.map(item => `<option value="${esc(item)}" ${item === value ? 'selected' : ''}>${esc(item || 'No PIC')}</option>`).join(''); }
  function field(id,key,value,label,kind='text',disabled=false) {
    const values = key === 'type' ? ['SKP','STP'] : key === 'tax' ? ['PPh 21','PPh 23','PPh 29','PPh 4(2)','PPN','Other'] : key === 'status' ? ['Draft','Diajukan','Dalam proses'] : null;
    const attrs = `class="cell-input ${kind === 'money' ? 'number' : ''}" data-doc="${esc(id)}" data-field="${key}" aria-label="${esc(label)}" ${disabled ? 'disabled' : ''}`;
    return values ? `<select ${attrs}>${options(values,value)}</select>` : `<input ${attrs} type="text" ${kind === 'money' || kind === 'date' ? 'inputmode="numeric"' : ''} ${kind === 'date' ? 'data-date-field placeholder="dd/mm/yyyy"' : ''} value="${esc(kind === 'money' ? money(value) : kind === 'date' ? displayDate(value) : value)}">`;
  }
  function matchingDocs(audit) {
    const query = $('search').value.trim().toLowerCase(), type = $('type-filter').value, state=$('psa-state-filter').value;
    return audit.documents.filter(doc => (tab !== 'psa' || doc.psa) && (!type || doc.type === type)
      && (tab !== 'psa' || !state || state==='ongoing'&&!window.AssessmentPanels.terminal(doc.psa) || state==='successful'&&window.AssessmentPanels.success(doc.psa) || state==='rejected'&&doc.psa?.status==='Ditolak')
      && (!query || `${audit.client} ${audit.audit} ${audit.sphp} ${audit.acc} ${audit.tax} ${doc.number} ${doc.tax} ${doc.psa?.application || ''}`.toLowerCase().includes(query)));
  }
  function scopedRows() {
    return audits.filter(audit => (!$('acc-filter').value || ($('acc-filter').value === '__none' ? !audit.acc : audit.acc === $('acc-filter').value))
      && (!$('tax-filter').value || audit.tax === $('tax-filter').value))
      .filter(audit => tab !== 'register' || audit.closed)
      .map(audit => ({audit,docs:matchingDocs(audit)})).filter(({audit,docs}) => docs.length || (tab === 'examination' || tab === 'register' && audit.closed && !audit.documents.length) && (!$('search').value.trim() || `${audit.client} ${audit.audit} ${audit.sphp} ${audit.acc} ${audit.tax}`.toLowerCase().includes($('search').value.trim().toLowerCase())) && !$('type-filter').value)
      .sort((a,b) => sorted ? sortDirection * a.audit.client.localeCompare(b.audit.client) : audits.indexOf(a.audit)-audits.indexOf(b.audit));
  }
  function psaView() { return tab === 'psa' || tab === 'examination' && window.AssessmentPanels.pane({id:expanded}) === 'psa'; }
  function eligible(docs) { return docs.filter(doc => psaView() ? Boolean(doc.psa) : !doc.psa); }
  function selectionHeader(audit,docs) {
    const enabled = eligible(docs), checked = enabled.length && enabled.every(doc => selected.has(doc.id));
    return `<input type="checkbox" data-select-all="${audit.id}" aria-label="Select all ${tab === 'psa' ? 'PSA' : 'SKP and STP'} documents for ${esc(audit.client)}" ${checked ? 'checked' : ''} ${enabled.length ? '' : 'disabled'}>`;
  }
  function checkbox(doc) { return `<input type="checkbox" data-select="${doc.id}" aria-label="Select ${esc(doc.number || 'new document')}" ${selected.has(doc.id) ? 'checked' : ''} ${!psaView() && doc.psa ? 'disabled' : ''}>`; }
  const cell = (label,html) => `<td data-label="${label}">${html}</td>`;
  function identity(audit) {
    return `<div class="identity-grid">${[['client','Client'],['audit','Audit reference'],['year','Tax year']].map(([key,label]) => `<label>${label}<input data-audit="${audit.id}" data-parent-field="${key}" value="${esc(audit[key])}" aria-label="${label}"></label>`).join('')}
      <label>ACC PIC<select data-audit="${audit.id}" data-parent-field="acc" aria-label="ACC PIC">${options(['','Cemari','Dina','Dewayu','Ivan','Tantri'],audit.acc)}</select></label>
      <label>Tax PIC<select data-audit="${audit.id}" data-parent-field="tax" aria-label="Tax PIC">${options(['','Bagus','Harry','Ita','Denny','Okta'],audit.tax)}</select></label></div>`;
  }
  function registerDetail(audit,docs) {
    const count = docs.filter(doc => selected.has(doc.id)).length;
    return `${identity(audit)}<div class="document-panel"><div class="document-toolbar"><div><h3>SKP &amp; STP documents</h3><p class="muted">Edit cells directly. Select individual documents for PSA.</p></div><div class="document-actions"><span class="selection-label">${count ? `${count} selected` : ''}</span><button class="secondary" data-add-doc="${audit.id}" data-kind="SKP">+ SKP</button><button class="secondary" data-add-doc="${audit.id}" data-kind="STP">+ STP</button><button class="primary" data-open-move ${selected.size ? '' : 'disabled'}>Move to PSA${selected.size ? ` (${selected.size})` : ''} &#8594;</button></div></div>
      <table class="document-list"><thead><tr><th>${selectionHeader(audit,docs)}</th><th>Type</th><th>Pajak</th><th>Masa / tahun</th><th>No. ketetapan / tagihan</th><th>Tgl. terbit</th><th class="number">Pokok (Rp)</th><th class="number">Sanksi (Rp)</th><th>PSA</th></tr></thead><tbody>${docs.map(doc => `<tr data-document="${doc.id}" data-selected="${selected.has(doc.id)}" data-in-psa="${Boolean(doc.psa)}">${cell('Select',checkbox(doc))}${cell('Type',field(doc.id,'type',doc.type,'Document type'))}${cell('Pajak',field(doc.id,'tax',doc.tax,'Tax type'))}${cell('Masa / tahun',field(doc.id,'period',doc.period,'Tax period'))}${cell('No. ketetapan / tagihan',field(doc.id,'number',doc.number,'Assessment number'))}${cell('Tgl. terbit',field(doc.id,'date',doc.date,'Issue date','date'))}${cell('Pokok (Rp)',field(doc.id,'principal',doc.principal,'Principal amount','money'))}${cell('Sanksi (Rp)',field(doc.id,'penalty',doc.penalty,'Penalty amount','money'))}${cell('PSA',doc.psa ? '<span class="tag teal">In PSA</span>' : '<span class="tag">Not routed</span>')}</tr>`).join('') || '<tr><td colspan="9" class="detail-empty">No documents yet. Add an SKP or STP above and fill in its cells.</td></tr>'}</tbody></table>
      <div class="document-footer"><span>${docs.length} documents &middot; Pokok Rp${money(sum(docs,'principal'))} &middot; Sanksi Rp${money(sum(docs,'penalty'))}</span><span>In PSA = linked, not deleted from this register.</span></div></div>`;
  }
  function examinationDetail(audit,docs) {
    const header=`<div class="audit-closure"><label>SPHP No.<input data-audit="${audit.id}" data-parent-field="sphp" aria-label="SPHP number" value="${esc(audit.sphp)}" ${audit.closed?'readonly':''} placeholder="Required to close"></label><span class="tag ${audit.closed?'green':'amber'}">${audit.closed?'Pemeriksaan closed':'In progress'}</span>${audit.closed?'<span class="muted">Add issued SKP / STP below, now or later. Both tabs share the same documents.</span>':`<button class="primary" data-close-case="${audit.id}">Close Pemeriksaan</button>`}</div>`;
    return window.AssessmentPanels.detail(audit,{header,identity:audit.closed?'':identity(audit),documents:audit.closed?registerDetail(audit,docs):'<div class="closure-gate-box"><strong>Byproducts open after SPHP closure.</strong><p class="muted">Enter the SPHP number, then close this case. You can register SKP / STP during closure or come back later.</p></div>',psa:psaDetail(audit,docs.filter(doc=>doc.psa))});
  }
  function updateClosureGate() {
    const ready=Boolean($('closure-sphp').value.trim());
    document.querySelectorAll('[data-stage-kind]').forEach(button=>{button.disabled=!ready;});
    $('confirm-closure').disabled=!ready;
    $('closure-gate').textContent=ready?'SPHP reference entered. Byproducts are optional at this stage.':'SPHP No. is required before adding byproducts or closing.';
  }
  function renderClosureDrafts() {
    $('closure-documents').innerHTML=pendingClosure.documents.length?`<table class="document-list closure-list"><thead><tr><th>Type</th><th>Pajak</th><th>Masa / tahun</th><th>No. SKP / STP</th><th>Tgl. terbit</th><th>Pokok (Rp)</th><th>Sanksi (Rp)</th></tr></thead><tbody>${pendingClosure.documents.map(doc=>`<tr>${cell('Type',field(doc.id,'type',doc.type,'Draft document type'))}${cell('Pajak',field(doc.id,'tax',doc.tax,'Draft tax type'))}${cell('Masa / tahun',field(doc.id,'period',doc.period,'Draft tax period'))}${cell('No. SKP / STP',field(doc.id,'number',doc.number,'Draft assessment number'))}${cell('Tgl. terbit',field(doc.id,'date',doc.date,'Draft issue date','date'))}${cell('Pokok (Rp)',field(doc.id,'principal',doc.principal,'Draft principal','money'))}${cell('Sanksi (Rp)',field(doc.id,'penalty',doc.penalty,'Draft penalty','money'))}</tr>`).join('')}</tbody></table>`:'<div class="detail-empty">No byproducts added. Close now and register the documents later if they have not been issued yet.</div>';
  }
  function cancelClosure() { $('closure-dialog').close();pendingClosure=null; }
  function psaDetail(audit,docs) {
    const state=window.AssessmentPanels.summary(docs);
    return `<div class="document-panel"><div class="document-toolbar"><div><h3>Pengurangan Sanksi Administrasi (PSA)</h3><p class="muted">${state.ongoing} ongoing / ${state.successful} successful / ${state.rejected} rejected. Shared with the Pemeriksaan PSA pane.</p></div><button class="secondary" data-return ${selected.size ? '' : 'disabled'}>Return selected to register</button></div>
      <table class="document-list psa-list"><thead><tr><th>${selectionHeader(audit,docs)}</th><th>Source SKP / STP</th><th>Pajak / masa</th><th class="number">Sanksi awal</th><th class="number">Sanksi dimohon</th><th>No. permohonan</th><th>Tgl. permohonan</th><th>Progress</th><th>Catatan / decision</th></tr></thead><tbody>${docs.map(doc => `<tr data-document="${doc.id}" data-selected="${selected.has(doc.id)}">${cell('Select',checkbox(doc))}${cell('Source SKP / STP',`<span class="source-ref">${esc(doc.number)}</span><span class="source-meta">${doc.type} &middot; ${esc(audit.audit)}</span>`)}${cell('Pajak / masa',`<span class="source-ref">${esc(doc.tax)}</span><span class="source-meta">${esc(doc.period)}</span>`)}${cell('Sanksi awal',`<span class="source-ref number">${money(doc.penalty)}</span>`)}${cell('Sanksi dimohon',field(doc.id,'requested',doc.psa.requested,'Requested penalty reduction','money',Boolean(doc.psa.decision)))}${cell('No. permohonan',field(doc.id,'application',doc.psa.application,'Application reference'))}${cell('Tgl. permohonan',field(doc.id,'date',doc.psa.date,'Application date','date'))}${cell('Progress',doc.psa.decision?`<span class="tag ${window.AssessmentPanels.success(doc.psa)?'green':'amber'}">${esc(doc.psa.status)}</span>`:field(doc.id,'status',doc.psa.status,'PSA progress'))}${cell('Catatan / decision',field(doc.id,'note',doc.psa.note,'PSA note')+`<button class="small-action" data-psa-decision="${doc.id}" data-audit="${audit.id}">${doc.psa.decision?'View decision':'Record decision'}</button>`+(doc.psa.decision?`<span class="source-meta">${esc(doc.psa.decision.proof)} / ${displayDate(doc.psa.decision.date)}<br>Granted Rp${money(doc.psa.decision.amount)}</span>`:''))}</tr>`).join('')}</tbody></table>
      <div class="document-footer"><span>${docs.length} linked documents &middot; Requested reduction Rp${money(docs.reduce((total,doc) => total + doc.psa.requested,0))}</span><span>Request values do not reduce the original assessment automatically.</span></div></div>`;
  }
  function renderRows() {
    const scope = scopedRows(), visibleDocs = scope.flatMap(row => row.docs), visibleIds = new Set(eligible(visibleDocs).map(doc => doc.id));
    selected = new Set([...selected].filter(id => visibleIds.has(id)));
    $('assessment-rows').innerHTML = scope.map(({audit,docs}) => {
      if(tab==='examination'){
        const open=expanded===audit.id;
        return `<tr class="case-row ${open?'selected':''}" data-audit-row="${audit.id}"><td><button class="row-toggle" data-expand="${audit.id}" aria-expanded="${open}" aria-label="Expand ${esc(audit.client)}">${audits.indexOf(audit)+1} ${open?'&#9662;':'&#9656;'}</button></td><td><button class="client-link" data-expand="${audit.id}">${esc(audit.client)}</button><span class="audit-ref">${docs.length} linked SKP / STP documents</span></td><td>${esc(audit.audit)}</td><td>${esc(audit.year)}</td><td>${esc(audit.acc || 'No PIC')}</td><td>${esc(audit.tax || 'No PIC')}</td><td><input class="sphp-input" data-audit="${audit.id}" data-parent-field="sphp" value="${esc(audit.sphp)}" aria-label="SPHP number for ${esc(audit.client)}" ${audit.closed?'readonly':''} placeholder="SPHP No."></td><td>${esc(displayDate(audit.sphpDate) || '-')}</td><td><span class="tag ${audit.closed?'green':'amber'}">${audit.closed?'Closed':'In progress'}</span></td></tr>${open?`<tr><td class="detail-cell" colspan="9"><div class="case-detail">${examinationDetail(audit,docs)}</div></td></tr>`:''}`;
      }
      const open = expanded === audit.id, amount = tab === 'register' ? sum(docs,'principal')+sum(docs,'penalty') : docs.reduce((total,doc) => total+doc.psa.requested,0);
      const state=window.AssessmentPanels.summary(docs),status=tab==='psa'?`${state.ongoing} ongoing / ${state.successful} successful / ${state.rejected} rejected`:!docs.length?'Awaiting documents':docs.some(doc=>doc.psa)?`${docs.filter(doc=>doc.psa).length} in PSA`:'Registered';
      return `<tr class="case-row ${open ? 'selected' : ''}" data-audit-row="${audit.id}"><td><button class="row-toggle" data-expand="${audit.id}" aria-expanded="${open}" aria-label="Expand ${esc(audit.client)}">${audits.indexOf(audit)+1} ${open ? '&#9662;' : '&#9656;'}</button></td><td><button class="client-link" data-expand="${audit.id}">${esc(audit.client)}</button><span class="audit-ref">${tab === 'psa' ? 'Linked assessment documents' : 'Post-audit assessment control'}</span></td><td>${esc(audit.audit)}</td><td>${esc(audit.year)}</td><td>${esc(audit.acc || 'No PIC')}</td><td>${esc(audit.tax || 'No PIC')}</td><td>${tab === 'register' ? `${docs.filter(doc=>doc.type==='SKP').length} / ${docs.filter(doc=>doc.type==='STP').length}` : `${docs.length} documents`}</td><td class="number">Rp${money(amount)}</td><td><span class="tag ${docs.some(doc=>doc.psa) ? 'teal' : ''}">${status}</span></td></tr>${open ? `<tr><td class="detail-cell" colspan="9"><div class="case-detail">${tab === 'register' ? registerDetail(audit,docs) : psaDetail(audit,docs)}</div></td></tr>` : ''}`;
    }).join('') || `<tr><td colspan="9" class="detail-empty">${tab === 'psa' ? 'No PSA documents match. Select SKP / STP documents in the register and move them here.' : 'No clients match these filters.'}</td></tr>`;
    $('visible-count').textContent = `${scope.length} client / audit controls`;
    const psaSummary=window.AssessmentPanels.summary(visibleDocs);
    $('summary').innerHTML = tab === 'examination' ? `<span><b>${scope.length}</b> Pemeriksaan cases</span><span><b>${scope.filter(row=>!row.audit.closed).length}</b> in progress</span><span><b>${scope.filter(row=>row.audit.closed).length}</b> closed at SPHP</span><span><b>${visibleDocs.length}</b> linked byproducts</span>` : tab === 'register' ? `<span><b>${scope.length}</b> clients / audits</span><span><b>${visibleDocs.filter(doc=>doc.type==='SKP').length}</b> SKP</span><span><b>${visibleDocs.filter(doc=>doc.type==='STP').length}</b> STP</span><span><b>Rp${money(sum(visibleDocs,'penalty'))}</b> assessed penalties</span>` : `<span><b>${visibleDocs.length}</b> linked documents</span><span><b>${psaSummary.ongoing}</b> ongoing</span><span><b>${psaSummary.successful}</b> successful</span><span><b>${psaSummary.rejected}</b> rejected</span>`;
    $('examination-count').textContent=String(audits.length);
    $('register-count').textContent = String(allDocs().length);$('psa-count').textContent = String(allDocs().filter(doc=>doc.psa).length);
    const sortButton=document.querySelector('[data-sort]');sortButton.querySelector('span').textContent=sorted?(sortDirection===1?'\u2191':'\u2193'):'\u2195';sortButton.parentElement.setAttribute('aria-sort',sorted?(sortDirection===1?'ascending':'descending'):'none');
  }
  function render() {
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.tab === tab)));
    $('section-title').textContent = tab === 'examination' ? 'Pemeriksaan' : tab === 'register' ? 'SKP & STP register' : 'Penalty Removal / PSA';
    $('section-description').textContent = tab === 'examination' ? 'Enter SPHP No. to close a case. Record SKP / STP during closure or later from the same case.' : tab === 'register' ? 'Automatically linked from closed Pemeriksaan cases. The same documents can be edited in either tab.' : 'Pengurangan Sanksi Administrasi. Select a client to work on its linked applications.';
    $('docs-heading').textContent = tab === 'examination' ? 'SPHP No.' : tab === 'register' ? 'SKP / STP' : 'PSA documents';$('amount-heading').textContent = tab === 'examination' ? 'SPHP date' : tab === 'register' ? 'Total ketetapan' : 'Pengurangan dimohon';
    $('type-filter').hidden=tab==='examination';if(tab==='examination')$('type-filter').value='';
    $('psa-state-filter').hidden=tab!=='psa';
    $('add-control').hidden = tab !== 'examination';renderRows();
  }
  function setupFilters() {
    $('acc-filter').innerHTML = '<option value="">All ACC PIC</option><option value="__none">No ACC PIC</option>'+['Cemari','Dina','Dewayu','Ivan','Tantri'].map(name=>`<option>${name}</option>`).join('');
    $('tax-filter').innerHTML = '<option value="">All Tax PIC</option>'+['Bagus','Harry','Ita','Denny','Okta'].map(name=>`<option>${name}</option>`).join('');
  }
  function resetFilters() { for(const id of ['search','acc-filter','tax-filter','type-filter','psa-state-filter'])$(id).value='';sorted=false;sortDirection=1; }
  document.addEventListener('click',event => {
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.tab){tab=button.dataset.tab;selected.clear();expanded=scopedRows()[0]?.audit.id || '';render();return;}
    if(button.dataset.expand){expanded=expanded===button.dataset.expand?'':button.dataset.expand;renderRows();return;}
    if(button.dataset.sort){sortDirection=sorted?-sortDirection:1;sorted=true;renderRows();return;}
    if(button.hasAttribute('data-close-case')){
      const audit=audits.find(row=>row.id===button.dataset.closeCase);if(!audit||audit.closed)return;
      pendingClosure={auditId:audit.id,documents:[]};$('closure-client').textContent=audit.client;$('closure-sphp').value=audit.sphp;$('closure-date').value=displayDate(audit.sphpDate);$('closure-error').textContent='';renderClosureDrafts();updateClosureGate();$('closure-dialog').showModal();$('closure-sphp').focus();return;
    }
    if(button.hasAttribute('data-close-examination')){cancelClosure();return;}
    if(button.dataset.stageKind){if(!pendingClosure||!$('closure-sphp').value.trim()){message('Enter SPHP No. first.');return;}const audit=audits.find(row=>row.id===pendingClosure.auditId);pendingClosure.documents.push({id:`doc-${++sequence}`,type:button.dataset.stageKind,tax:'PPN',period:audit.year,number:'',date:'',principal:0,penalty:0,psa:null});renderClosureDrafts();return;}
    if(button.hasAttribute('data-add-doc')){const audit=audits.find(row=>row.id===button.dataset.addDoc);if(!audit?.closed||!audit.sphp.trim()){message('Enter SPHP No. and close Pemeriksaan before registering byproducts.');return;}audit.documents.push({id:`doc-${++sequence}`,type:button.dataset.kind,tax:'PPN',period:audit.year,number:'',date:'',principal:0,penalty:0,psa:null});renderRows();message('Document added to this Pemeriksaan and linked to SKP & STP automatically.');return;}
    if(button.hasAttribute('data-open-move')){
      pendingMove=[...selected].map(findDoc).filter(doc=>doc&&!doc.psa);
      if(!pendingMove.length)return;
      if(pendingMove.some(doc=>!doc.number.trim()||!doc.date||!doc.penalty)){message('Fill in the document number, issue date and penalty amount before routing to PSA.');return;}
      $('move-preview').innerHTML=pendingMove.map(doc=>`<div class="move-item"><div><strong>${esc(doc.type)} ${esc(doc.number)}</strong><small>${esc(doc.tax)} / ${esc(doc.period)}</small></div><strong>Rp${money(doc.penalty)}</strong></div>`).join('');$('move-dialog').showModal();return;
    }
    if(button.hasAttribute('data-close-dialog')){$('move-dialog').close();pendingMove=[];return;}
    if(button.hasAttribute('data-return')){
      const docs=[...selected].map(findDoc).filter(doc=>doc?.psa);if(!docs.length)return;
      if(docs.some(doc=>doc.psa.status!=='Draft')){message('Only draft requests can be returned directly in this preview. Submitted requests need an amendment/cancellation control.');return;}
      docs.forEach(doc=>{doc.psa=null;});selected.clear();render();message('Draft routing removed. Original assessment documents are unchanged.');return;
    }
    if(button.id==='reset-filters'){resetFilters();selected.clear();render();}
    if(button.id==='reset-demo'){audits=structuredClone(initial);window.AssessmentPanels.reset();tab='examination';expanded='audit-3';selected.clear();resetFilters();render();message('Sample data reset.');}
    if(button.id==='add-control'&&tab==='examination'){const audit={id:`audit-${++sequence}`,client:'New client / audit',audit:'',year:'2025',acc:'',tax:'',sphp:'',sphpDate:'',closed:false,documents:[]};audits.push(audit);resetFilters();expanded=audit.id;render();document.querySelector(`[data-audit="${audit.id}"][data-parent-field="client"]`)?.focus();}
  });
  $('move-form').addEventListener('submit',event=>{
    event.preventDefault();const count=pendingMove.length;
    pendingMove.forEach(doc=>{if(!doc.psa)doc.psa={requested:doc.penalty,application:'',date:'',status:'Draft',note:''};});
    $('move-dialog').close();selected.clear();pendingMove=[];render();message(`${count} document(s) moved to PSA. Open Penalty Removal to continue.`);
  });
  $('closure-sphp').addEventListener('input',updateClosureGate);
  $('closure-dialog').addEventListener('cancel',()=>{pendingClosure=null;});
  $('closure-form').addEventListener('submit',event=>{
    event.preventDefault();if(!pendingClosure)return;
    const audit=audits.find(row=>row.id===pendingClosure.auditId),sphp=$('closure-sphp').value.trim(),date=parseDate($('closure-date').value.trim());
    if(!audit||audit.closed){$('closure-error').textContent='This case is already closed or unavailable.';return;}
    if(!sphp){$('closure-error').textContent='Enter SPHP No. before closing or registering byproducts.';return;}
    if(date===null){$('closure-error').textContent='Use a valid dd/mm/yyyy SPHP date, or leave it blank.';return;}
    if(pendingClosure.documents.some(doc=>!doc.number.trim()||!doc.date||!doc.tax||!doc.period.trim())){$('closure-error').textContent='Complete each byproduct reference, issue date, tax and period, or cancel and record it later.';return;}
    const keys=pendingClosure.documents.map(doc=>`${doc.type}|${doc.number.trim().toLowerCase()}`);
    if(new Set(keys).size!==keys.length){$('closure-error').textContent='Duplicate document references. Each byproduct must be registered once.';return;}
    audit.sphp=sphp;audit.sphpDate=date;audit.closed=true;
    audit.documents.push(...pendingClosure.documents);const count=pendingClosure.documents.length;
    window.AssessmentPanels.record(audit,`Pemeriksaan closed at ${sphp}; ${count} byproduct(s) registered.`);
    cancelClosure();expanded=audit.id;render();message(`Pemeriksaan closed at SPHP. ${count} byproduct(s) linked to SKP & STP. More can be added here later.`);
  });
  document.addEventListener('change',event=>{
    const element=event.target;
    if(element.hasAttribute('data-select')){element.checked?selected.add(element.dataset.select):selected.delete(element.dataset.select);renderRows();return;}
    if(element.hasAttribute('data-select-all')){const audit=audits.find(row=>row.id===element.dataset.selectAll);eligible(matchingDocs(audit)).forEach(doc=>element.checked?selected.add(doc.id):selected.delete(doc.id));renderRows();return;}
    if(element.dataset.parentField){const audit=audits.find(row=>row.id===element.dataset.audit),key=element.dataset.parentField;if(!audit||!['client','audit','year','acc','tax','sphp'].includes(key))return;if(key==='sphp'&&audit.closed){element.value=audit.sphp;return;}const value=element.value.trim();if(key==='client'&&!value||key==='year'&&!/^\d{4}$/.test(value)){element.value=audit[key];message('Enter a client name and a four-digit tax year.');return;}audit[key]=value;renderRows();message('Audit control updated in this preview only.');return;}
    if(element.dataset.doc){
      const staged=pendingClosure?.documents.find(doc=>doc.id===element.dataset.doc),doc=staged||findDoc(element.dataset.doc),key=element.dataset.field;
      if(!doc)return;const editingPsa=!staged&&psaView(),target=editingPsa?doc.psa:doc;
      const allowed=editingPsa?['requested','application','date','status','note']:['type','tax','period','number','date','principal','penalty'];if(!target||!allowed.includes(key))return;
      if(editingPsa&&doc.psa.decision&&key!=='note'){renderRows();message('Recorded decisions require a separate correction workflow.');return;}
      let value=element.value.trim();
      if(key==='date'){
        value=parseDate(value);if(value===null){element.value=displayDate(target[key]);message('Use a valid dd/mm/yyyy date.');return;}
      }
      if(['principal','penalty','requested'].includes(key)){
        if(!/^\d[\d.\s]*$/.test(value)||!Number.isSafeInteger(Number(value.replace(/[.\s]/g,'')))){element.value=money(target[key]);message('Use a non-negative whole-rupiah amount.');return;}
        value=Number(value.replace(/[.\s]/g,''));
        if(!editingPsa&&['principal','penalty'].includes(key)&&doc.payment?.plan.length&&value!==doc[key]){element.value=money(doc[key]);message('A payment schedule exists. Use an audited correction before changing assessment amounts.');return;}
        if(key==='requested'&&value>doc.penalty||key==='penalty'&&doc.psa&&value<doc.psa.requested){element.value=money(target[key]);message('Requested reduction cannot exceed the assessed penalty.');return;}
      }
      if(editingPsa&&key==='status'&&!['Draft','Diajukan','Dalam proses'].includes(value)){renderRows();return;}
      target[key]=value;if(staged)renderClosureDrafts();else renderRows();message('Updated in this preview only. No database write.');return;
    }
    if(['acc-filter','tax-filter','type-filter','psa-state-filter'].includes(element.id)){renderRows();}
  });
  $('search').addEventListener('input',()=>renderRows());
  $('move-dialog').addEventListener('click',event=>{if(event.target===$('move-dialog')){const box=event.target.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom){event.target.close();pendingMove=[];}}});
  window.AssessmentPanels.configure({getAudit:id=>audits.find(audit=>audit.id===id),render:renderRows,clearSelection:()=>selected.clear(),openPenalty:id=>{tab='psa';resetFilters();selected.clear();expanded=id;render();},parseDate,message});
  setupFilters();render();
})();
