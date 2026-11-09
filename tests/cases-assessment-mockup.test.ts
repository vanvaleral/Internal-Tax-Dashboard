import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM,VirtualConsole} from 'jsdom';
const read=(name:string)=>readFileSync(new URL(`../public/${name}`,import.meta.url),'utf8');
function preview(tab='register'){
  const errors:string[]=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(read('cases-assessment-mockup.html'),{url:'https://preview.invalid/cases-assessment-mockup.html',runScripts:'outside-only',virtualConsole:vc});
  const w=dom.window as any;w.structuredClone=structuredClone;w.fetch=()=>{throw Error('Mockup must not make network calls');};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  w.eval(read('cases-assessment-panels.js'));
  w.eval(read('cases-assessment-mockup.js'));
  if(tab!=='examination')w.document.querySelector(`[data-tab="${tab}"]`).click();
  const q=(selector:string)=>w.document.querySelector(selector);
  const change=(selector:string,value:any)=>{const field=q(selector);assert.ok(field,selector);if(field.type==='checkbox')field.checked=value;else field.value=value;field.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const move=()=>{q('[data-open-move]').click();assert.ok(q('#move-dialog').open);q('#move-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
  return {dom,w,q,change,move,errors};
}
test('assessment preview uses compact audit rows, an expanded editable document list and no live connection',()=>{
  const d=preview();try{
    assert.equal(d.w.document.querySelectorAll('[data-audit-row]').length,2);assert.equal(d.w.document.querySelectorAll('[data-document]').length,3);
    assert.match(d.q('#summary').textContent,/3.*SKP/);assert.match(d.q('#summary').textContent,/2.*STP/);
    assert.equal(d.q('#register-count').textContent,'5');assert.equal(d.q('#psa-count').textContent,'1');assert.deepEqual(d.errors,[]);
    assert.doesNotMatch(read('cases-assessment-mockup.js'),/fetch\(|localStorage|supabase|XMLHttpRequest/);
  }finally{d.dom.window.close();}
});
test('adding SKP/STP inserts inline blank rows and edits are reflected in parent totals',()=>{
  const d=preview();try{
    d.q('[data-add-doc][data-kind="STP"]').click();
    const doc=d.w.document.querySelectorAll('[data-document]')[3].dataset.document;
    d.change(`[data-doc="${doc}"][data-field="number"]`,'STP/NEW/DEMO');
    d.change(`[data-doc="${doc}"][data-field="penalty"]`,'1.500.000');
    assert.equal(d.q(`[data-doc="${doc}"][data-field="penalty"]`).value,'1.500.000');assert.equal(d.q('#register-count').textContent,'6');
    assert.match(d.q('[data-audit-row="audit-1"]').textContent,/Rp39\.300\.000/);
    d.change(`[data-doc="${doc}"][data-field="penalty"]`,'-5');assert.equal(d.q(`[data-doc="${doc}"][data-field="penalty"]`).value,'1.500.000');assert.match(d.q('#assessment-message').textContent,/non-negative/);
  }finally{d.dom.window.close();}
});
test('multiple documents move to PSA without deleting originals or duplicating assessment amounts',()=>{
  const d=preview();try{
    const before=d.q('[data-audit-row="audit-1"] .number').textContent;
    d.change('[data-select="doc-1"]',true);d.change('[data-select="doc-3"]',true);assert.match(d.q('[data-open-move]').textContent,/2/);d.move();
    assert.equal(d.q('#register-count').textContent,'5');assert.equal(d.q('#psa-count').textContent,'3');assert.equal(d.q('[data-audit-row="audit-1"] .number').textContent,before);
    assert.equal(d.q('[data-select="doc-1"]').disabled,true);assert.match(d.q('[data-document="doc-1"]').textContent,/In PSA/);
    d.q('[data-tab="psa"]').click();assert.equal(d.w.document.querySelectorAll('[data-document]').length,2);assert.match(d.q('#amount-heading').textContent,/Pengurangan dimohon/);
    assert.match(d.q('[data-document="doc-1"]').textContent,/00001\/206\/24\/DEMO/);
    d.change('[data-doc="doc-1"][data-field="requested"]','4.000.000');assert.equal(d.q('[data-doc="doc-1"][data-field="requested"]').value,'3.600.000');
    d.change('[data-doc="doc-1"][data-field="application"]','PSA/NEW/DEMO');assert.equal(d.q('[data-doc="doc-1"][data-field="application"]').value,'PSA/NEW/DEMO');
  }finally{d.dom.window.close();}
});
test('select all respects document filters; already-routed documents are excluded and incomplete rows cannot be routed',()=>{
  const d=preview();try{
    d.change('#type-filter','STP');d.change('[data-select-all="audit-1"]',true);assert.match(d.q('[data-open-move]').textContent,/1/);d.move();assert.equal(d.q('#psa-count').textContent,'2');
    d.q('#reset-filters').click();d.q('[data-add-doc][data-kind="SKP"]').click();
    const last=[...d.w.document.querySelectorAll('[data-document]')].at(-1) as any;
    d.change(`[data-select="${last.dataset.document}"]`,true);d.q('[data-open-move]').click();assert.equal(d.q('#move-dialog').open,false);assert.match(d.q('#assessment-message').textContent,/Fill in/);
  }finally{d.dom.window.close();}
});
test('ACC and Tax PIC filters combine; client sorting, reset and draft return preserve source identities',()=>{
  const d=preview();try{
    d.change('#acc-filter','Dina');d.change('#tax-filter','Bagus');assert.equal(d.w.document.querySelectorAll('[data-audit-row]').length,0);
    d.q('#reset-filters').click();d.q('[data-sort]').click();assert.equal(d.w.document.querySelectorAll('[data-audit-row]')[0].dataset.auditRow,'audit-2');assert.equal(d.q('[data-sort]').parentElement.getAttribute('aria-sort'),'ascending');
    d.q('[data-sort]').click();assert.equal(d.w.document.querySelectorAll('[data-audit-row]')[0].dataset.auditRow,'audit-1');
    d.q('[data-tab="psa"]').click();assert.equal(d.w.document.querySelectorAll('[data-audit-row]').length,1);d.change('[data-select-all="audit-2"]',true);d.q('[data-return]').click();assert.equal(d.q('#psa-count').textContent,'0');
    d.q('[data-tab="register"]').click();assert.equal(d.q('#register-count').textContent,'5');assert.equal(d.w.document.querySelectorAll('[data-audit-row]').length,2);
  }finally{d.dom.window.close();}
});
test('preview preserves escaped text, supports adding a new audit and refresh/reset restores sample state',()=>{
  const d=preview();try{
    d.change('[data-audit="audit-1"][data-parent-field="client"]','<img src=x onerror=alert(1)>');
    assert.equal(d.q('[data-audit-row="audit-1"] img'),null);assert.match(d.q('[data-audit-row="audit-1"]').textContent,/<img/);
    d.q('[data-tab="examination"]').click();d.q('#add-control').click();assert.equal(d.w.document.querySelectorAll('[data-audit-row]').length,4);assert.equal(d.w.document.activeElement.getAttribute('data-parent-field'),'client');
    d.q('#reset-demo').click();assert.equal(d.w.document.querySelectorAll('[data-audit-row]').length,3);assert.equal(d.q('#psa-count').textContent,'1');assert.deepEqual(d.errors,[]);
    const css=read('cases-assessment-mockup.css');assert.match(css,/@media\(max-width:900px\)/);assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  }finally{d.dom.window.close();}
});

test('assessment and application dates stay day-first, invalid dates revert and new controls have no assigned PIC',()=>{
  const d=preview();try{
    assert.equal(d.q('[data-doc="doc-1"][data-field="date"]').value,'20/10/2026');
    d.change('[data-doc="doc-1"][data-field="date"]','31/11/2026');assert.equal(d.q('[data-doc="doc-1"][data-field="date"]').value,'20/10/2026');
    d.change('[data-doc="doc-1"][data-field="date"]','9/11/2026');assert.equal(d.q('[data-doc="doc-1"][data-field="date"]').value,'09/11/2026');
    d.q('[data-tab="psa"]').click();assert.equal(d.q('[data-doc="doc-4"][data-field="date"]').value,'03/11/2026');
    d.q('[data-tab="examination"]').click();d.q('#add-control').click();
    assert.equal(d.q('[data-parent-field="tax"]').value,'');assert.equal(d.q('[data-parent-field="acc"]').value,'');
  }finally{d.dom.window.close();}
});

const submitClosure=(d:any)=>d.q('#closure-form').dispatchEvent(new d.w.Event('submit',{bubbles:true,cancelable:true}));
function enterSphp(d:any,value='SPHP/NEW/003') { d.q('#closure-sphp').value=value;d.q('#closure-sphp').dispatchEvent(new d.w.Event('input',{bubbles:true})); }

test('Pemeriksaan closure requires SPHP, gates byproducts, and typing a number never auto-closes the case',()=>{
  const d=preview('examination');try{
    assert.match(d.q('[data-audit-row="audit-3"]').textContent,/In progress/);assert.equal(d.q('[data-add-doc]'),null);
    d.q('[data-close-case="audit-3"]').click();assert.equal(d.q('#confirm-closure').disabled,true);assert.equal(d.q('[data-stage-kind="SKP"]').disabled,true);
    submitClosure(d);assert.match(d.q('#closure-error').textContent,/Enter SPHP/);assert.match(d.q('[data-audit-row="audit-3"]').textContent,/In progress/);
    enterSphp(d);assert.equal(d.q('#confirm-closure').disabled,false);assert.equal(d.q('[data-stage-kind="STP"]').disabled,false);
    assert.match(d.q('[data-audit-row="audit-3"]').textContent,/In progress/);submitClosure(d);
    assert.match(d.q('[data-audit-row="audit-3"]').textContent,/Closed/);assert.equal(d.q('#register-count').textContent,'5');
    d.q('[data-tab="register"]').click();assert.equal(d.w.document.querySelectorAll('[data-audit-row]').length,3);
    assert.match(d.q('[data-audit-row="audit-3"]').textContent,/Awaiting documents/);
  }finally{d.dom.window.close();}
});

test('byproducts entered during closure are committed once and shared with SKP/STP and PSA',()=>{
  const d=preview('examination');try{
    d.q('[data-close-case="audit-3"]').click();enterSphp(d);d.q('[data-stage-kind="SKP"]').click();d.q('[data-stage-kind="STP"]').click();
    const inputs=[...d.w.document.querySelectorAll('#closure-documents [data-field="number"]')];
    for(let index=0;index<inputs.length;index++){
      const id=inputs[index].dataset.doc;d.change(`#closure-documents [data-doc="${id}"][data-field="number"]`,`ASSESSMENT/NEW/${index+1}`);
      d.change(`#closure-documents [data-doc="${id}"][data-field="date"]`,'09/11/2026');d.change(`#closure-documents [data-doc="${id}"][data-field="penalty"]`,'500.000');
    }
    assert.equal(d.q('#register-count').textContent,'5');submitClosure(d);assert.equal(d.q('#closure-dialog').open,false);assert.equal(d.q('#register-count').textContent,'7');
    d.q('[data-tab="register"]').click();d.q('[data-expand="audit-3"]').click();assert.equal(d.w.document.querySelectorAll('[data-document]').length,2);
    const id=inputs[0].dataset.doc;assert.equal(d.q(`[data-doc="${id}"][data-field="number"]`).value,'ASSESSMENT/NEW/1');
    d.change(`[data-select="${id}"]`,true);d.move();assert.equal(d.q('#register-count').textContent,'7');assert.equal(d.q('#psa-count').textContent,'2');
    d.q('[data-tab="examination"]').click();d.q('[data-expand="audit-3"]').click();assert.match(d.q(`[data-document="${id}"]`).textContent,/In PSA/);
    assert.deepEqual(d.errors,[]);
  }finally{d.dom.window.close();}
});

test('closing without byproducts permits later entry in Pemeriksaan and edits stay linked across tabs',()=>{
  const d=preview('examination');try{
    d.q('[data-close-case="audit-3"]').click();enterSphp(d);submitClosure(d);
    d.q('[data-add-doc][data-kind="STP"]').click();const id=d.q('[data-document]').dataset.document;
    d.change(`[data-doc="${id}"][data-field="number"]`,'STP/LATER/001');
    d.q('[data-tab="register"]').click();d.q('[data-expand="audit-3"]').click();assert.equal(d.q(`[data-doc="${id}"][data-field="number"]`).value,'STP/LATER/001');
    d.change(`[data-doc="${id}"][data-field="number"]`,'STP/REVISED/001');
    d.q('[data-tab="examination"]').click();d.q('[data-expand="audit-3"]').click();assert.equal(d.q(`[data-doc="${id}"][data-field="number"]`).value,'STP/REVISED/001');assert.equal(d.q('#register-count').textContent,'6');
    assert.equal(d.q('[data-close-case="audit-3"]'),null);
  }finally{d.dom.window.close();}
});

test('cancelling or invalid byproducts leave the examination open and register unchanged',()=>{
  const d=preview('examination');try{
    d.q('[data-close-case="audit-3"]').click();enterSphp(d);d.q('[data-stage-kind="SKP"]').click();submitClosure(d);
    assert.match(d.q('#closure-error').textContent,/Complete each byproduct/);assert.equal(d.q('#closure-dialog').open,true);assert.equal(d.q('#register-count').textContent,'5');
    d.q('#closure-dialog [data-close-examination]').click();assert.equal(d.q('#closure-dialog').open,false);assert.match(d.q('[data-audit-row="audit-3"]').textContent,/In progress/);
    d.q('[data-tab="register"]').click();assert.equal(d.q('[data-audit-row="audit-3"]'),null);assert.equal(d.q('#register-count').textContent,'5');
  }finally{d.dom.window.close();}
});

const submitForm=(d:any,selector:string)=>d.q(selector).dispatchEvent(new d.w.Event('submit',{bubbles:true,cancelable:true}));
const actionValue=(d:any,name:string,value:string)=>{d.q(`#assessment-action-fields [name="${name}"]`).value=value;};

test('Pemeriksaan has Progress, payments and shared PSA; My Work completion adds sourced events only once',()=>{
  const d=preview('examination');try{
    assert.deepEqual([...d.w.document.querySelectorAll('[data-assessment-pane]')].map((el:any)=>el.dataset.assessmentPane),['progress','payments','psa']);
    assert.doesNotMatch(d.q('.case-detail').textContent,/Tax Execution/);
    d.q('[data-assessment-task-form] [name="title"]').value='<img src=x> Prepare reconciliation';submitForm(d,'[data-assessment-task-form]');
    const tasks=d.w.document.querySelectorAll('[data-assessment-task]'),id=tasks[1].dataset.assessmentTask;
    d.change(`[data-assessment-task="${id}"]`,true);d.change(`[data-assessment-task="${id}"]`,true);
    const events=[...d.w.document.querySelectorAll('[data-assessment-timeline]')].filter((el:any)=>el.textContent.includes('Completed My Work: <img src=x>')) as any[];
    assert.equal(events.length,1);assert.equal(events[0].querySelector('[data-remove-note]'),null);assert.equal(d.q('.case-detail img'),null);
    d.q('[data-assessment-pane="payments"]').click();assert.match(d.q('.case-detail').textContent,/No SKP \/ STP byproducts/);
    d.q('[data-assessment-pane="progress"]').click();assert.equal(d.q(`[data-assessment-task="${id}"]`).checked,true);assert.deepEqual(d.errors,[]);
  }finally{d.dom.window.close();}
});

test('incorrect manual progress can be removed and restored without removing My Work or financial history',()=>{
  const d=preview('examination');try{
    d.q('[data-assessment-progress-form] [name="entry"]').value='Incorrect client meeting note';submitForm(d,'[data-assessment-progress-form]');
    const button=d.q('[data-remove-note]'),id=button.dataset.removeNote;button.click();
    assert.equal(d.q(`[data-assessment-timeline="${id}"]`),null);assert.match(d.q('.removed-updates').textContent,/Incorrect client meeting note/);
    d.q(`[data-restore-note="${id}"]`).click();assert.match(d.q(`[data-assessment-timeline="${id}"]`).textContent,/Incorrect client meeting note/);
    d.q('[data-assessment-task]').click();assert.equal(d.q('[data-assessment-timeline^="work-event-"] [data-remove-note]'),null);
    assert.match(d.q('[data-audit-row="audit-3"]').textContent,/In progress/);assert.deepEqual(d.errors,[]);
  }finally{d.dom.window.close();}
});

test('Pemeriksaan instalments preserve exact totals and month ends; receipts prevent overpayment or silent rescheduling',()=>{
  const d=preview('examination');try{
    d.q('[data-expand="audit-1"]').click();d.q('[data-assessment-pane="payments"]').click();d.q('[data-assessment-plan="doc-3"]').click();
    actionValue(d,'count','7');actionValue(d,'date','31/01/2027');submitForm(d,'#assessment-action-form');
    const rows=[...d.w.document.querySelectorAll('.payment-list tbody tr')] as any[];assert.equal(rows.length,7);
    assert.match(rows[0].textContent,/31\/01\/2027/);assert.match(rows[1].textContent,/28\/02\/2027/);assert.match(rows[6].textContent,/Rp171\.432/);
    assert.equal(rows.reduce((n,row)=>n+Number(row.cells[2].textContent.replace(/[^0-9]/g,'')),0),1200000);
    d.q('[data-assessment-payment]').click();actionValue(d,'amount','171429');actionValue(d,'proof','NTPN-DEMO');submitForm(d,'#assessment-action-form');
    assert.match(d.q('#assessment-action-error').textContent,/remaining balance/);assert.equal(d.q('#assessment-action-dialog').open,true);
    actionValue(d,'amount','171428');actionValue(d,'proof','');submitForm(d,'#assessment-action-form');assert.match(d.q('#assessment-action-error').textContent,/proof/);
    actionValue(d,'proof','NTPN-DEMO');submitForm(d,'#assessment-action-form');assert.equal(d.q('#assessment-action-dialog').open,false);
    assert.equal(d.q('[data-assessment-plan="doc-3"]').disabled,true);assert.match(d.q('.payment-cards').textContent,/NTPN-DEMO/);
    d.q('[data-tab="register"]').click();d.change('[data-doc="doc-3"][data-field="penalty"]','1.300.000');
    assert.equal(d.q('[data-doc="doc-3"][data-field="penalty"]').value,'1.200.000');assert.match(d.q('#assessment-message').textContent,/payment schedule exists/);
    d.q('[data-tab="examination"]').click();d.q('[data-assessment-pane="progress"]').click();assert.match(d.q('.case-detail .timeline').textContent,/Verified payment/);
    const event=[...d.w.document.querySelectorAll('[data-assessment-timeline]')].find((el:any)=>el.textContent.includes('Verified payment')) as any;
    assert.equal(event.querySelector('[data-remove-note]'),null);assert.deepEqual(d.errors,[]);
  }finally{d.dom.window.close();}
});

test('per-case PSA edits and successful decisions stay shared with Penalty Removal without reducing assessments',()=>{
  const d=preview('examination');try{
    d.q('[data-expand="audit-2"]').click();d.q('[data-assessment-pane="psa"]').click();
    d.q('[data-psa-decision="doc-4"]').click();assert.equal(d.q('#assessment-action-dialog').open,false);assert.match(d.q('#assessment-message').textContent,/submitted progress/);
    d.change('[data-doc="doc-4"][data-field="application"]','PSA/SHARED/001');d.change('[data-doc="doc-4"][data-field="status"]','Diajukan');
    d.q('[data-go-penalty="audit-2"]').click();assert.equal(d.q('[data-tab="psa"]').getAttribute('aria-pressed'),'true');assert.equal(d.q('[data-doc="doc-4"][data-field="application"]').value,'PSA/SHARED/001');
    d.q('[data-psa-decision="doc-4"]').click();actionValue(d,'outcome','Disetujui sebagian');actionValue(d,'amount','1000000');actionValue(d,'proof','KEP/DEMO/001');actionValue(d,'date','09/11/2026');submitForm(d,'#assessment-action-form');
    assert.match(d.q('#summary').textContent,/1.*successful/);assert.match(d.q('[data-audit-row="audit-2"]').textContent,/0 ongoing \/ 1 successful/);
    d.change('#psa-state-filter','ongoing');assert.equal(d.q('[data-audit-row]'),null);d.change('#psa-state-filter','successful');
    assert.equal(d.q('[data-audit-row]').dataset.auditRow,'audit-2');assert.match(d.q('[data-document="doc-4"]').textContent,/KEP\/DEMO\/001/);
    d.q('[data-psa-decision="doc-4"]').click();assert.equal(d.q('#assessment-action-fields [name="outcome"]').value,'Disetujui sebagian');assert.equal(d.q('#assessment-action-fields [name="amount"]').disabled,true);
    d.q('[data-close-assessment-action]').click();d.q('[data-tab="examination"]').click();d.q('[data-expand="audit-2"]').click();
    assert.match(d.q('.psa-overview').textContent,/1 successful/);assert.match(d.q('[data-document="doc-4"]').textContent,/KEP\/DEMO\/001/);
    d.q('[data-assessment-pane="payments"]').click();assert.match(d.q('.payment-cards').textContent,/Payable Rp2\.000\.000/);assert.deepEqual(d.errors,[]);
  }finally{d.dom.window.close();}
});

test('rejected PSA needs a zero grant, valid decision date and proof and is not counted as successful',()=>{
  const d=preview('psa');try{
    d.change('[data-doc="doc-4"][data-field="status"]','Dalam proses');d.q('[data-psa-decision="doc-4"]').click();
    actionValue(d,'outcome','Ditolak');actionValue(d,'amount','500000');actionValue(d,'proof','KEP/REJECTED');submitForm(d,'#assessment-action-form');assert.match(d.q('#assessment-action-error').textContent,/matching the decision/);
    actionValue(d,'amount','0');actionValue(d,'date','31/02/2026');submitForm(d,'#assessment-action-form');assert.match(d.q('#assessment-action-error').textContent,/valid dd\/mm\/yyyy/);
    actionValue(d,'date','09/11/2026');submitForm(d,'#assessment-action-form');assert.equal(d.q('#assessment-action-dialog').open,false);
    assert.match(d.q('#summary').textContent,/0.*successful.*1.*rejected/);d.change('#psa-state-filter','rejected');assert.equal(d.q('[data-audit-row]').dataset.auditRow,'audit-2');
    d.change('#psa-state-filter','successful');assert.equal(d.q('[data-audit-row]'),null);assert.deepEqual(d.errors,[]);
  }finally{d.dom.window.close();}
});
