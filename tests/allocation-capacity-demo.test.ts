import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
function demo(){
  const dom=new JSDOM(read('public/allocation-capacity-demo.html'),{runScripts:'outside-only'}),w=dom.window as any;
  w.structuredClone=structuredClone;w.setTimeout=()=>0;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const source=read('public/allocation-capacity-demo.js').replace('  render();\n})();','  window.__demo={metrics,changes,risks,stage,getData:()=>data,getActivity:()=>activity,render};\n  render();\n})();');
  w.eval(source);
  const change=(selector:string,value:string)=>{const input=w.document.querySelector(selector);assert.ok(input,selector);input.value=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const click=(selector:string)=>{const input=w.document.querySelector(selector);assert.ok(input,selector);input.click();};
  const submit=()=>w.document.querySelector('#apply-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,w,api:w.__demo,change,click,submit};
}
test('separate Tax workload, skill mismatch, unknown estimates and ownership are visible',()=>{
  const d=demo();try{
    assert.match(d.w.document.querySelector('[data-load-planned="tax-citra"]').textContent,/127\.5%/);
    assert.match(d.w.document.querySelector('[data-load-planned="tax-bima"]').textContent,/48%/);
    assert.match(d.w.document.querySelector('[data-staff-row="tax-citra"]').textContent,/3 needs review/);
    assert.match(d.w.document.querySelector('[data-staff-row="tax-ayu"]').textContent,/At least 82\.9%[\s\S]*1 hours missing[\s\S]*1 unrated/);
    assert.match(d.w.document.querySelector('#coverage').textContent,/11\/12[\s\S]*11\/12[\s\S]*1 no PIC/);
  }finally{d.dom.window.close();}
});
test('staging and reviewing transfers previews capacity without mutating current assignment',()=>{
  const d=demo();try{
    d.change('[data-pic-next="client-1"]','tax-bima');
    assert.equal(d.api.getData().clients[0].tax.pic,'tax-citra');
    assert.match(d.w.document.querySelector('[data-load-planned="tax-citra"]').textContent,/97\.5%/);
    assert.match(d.w.document.querySelector('[data-load-planned="tax-bima"]').textContent,/72%/);
    d.click('#review-plan');assert.match(d.w.document.querySelector('#review-content').textContent,/102h[\s\S]*78h[\s\S]*48h[\s\S]*72h/);
    d.submit();assert.equal(d.api.getData().clients[0].tax.pic,'tax-bima');assert.equal(d.api.changes().length,0);
    const event=d.api.getActivity()[0];assert.equal(event.type,'allocation');assert.equal(event.details.changes[0].from,'tax-citra');assert.equal(event.details.changes[0].assessment.hours,24);
  }finally{d.dom.window.close();}
});
test('difficulty mismatch requires a reason/support plan, not a silent automatic assignment',()=>{
  const d=demo();try{
    d.change('[data-pic-next="client-2"]','tax-bima');d.click('#review-plan');
    assert.match(d.w.document.querySelector('#review-content').textContent,/exceeds Bima.*independent level 3/);
    d.submit();assert.equal(d.api.getData().clients[1].tax.pic,'tax-citra');assert.match(d.w.document.querySelector('#review-error').textContent,/support plan/);
    d.w.document.querySelector('#reason').value='Ayu will review the first two cycles.';d.submit();
    assert.equal(d.api.getData().clients[1].tax.pic,'tax-bima');assert.match(d.api.getActivity()[0].details.reason,/Ayu/);
  }finally{d.dom.window.close();}
});
test('blank and zero effort are distinct and zero availability never creates NaN or infinity',()=>{
  const d=demo();try{
    d.change('[data-client="client-1"][data-assess-field="hours"]','');
    assert.equal(d.api.getData().clients[0].tax.hours,null);assert.match(d.w.document.querySelector('[data-load-planned="tax-citra"]').textContent,/At least/);
    d.change('[data-client="client-1"][data-assess-field="hours"]','0');
    assert.equal(d.api.getData().clients[0].tax.hours,0);assert.doesNotMatch(d.w.document.querySelector('[data-load-planned="tax-citra"]').textContent,/At least/);
    d.change('[data-staff="tax-citra"][data-staff-field="capacity"]','0');
    assert.match(d.w.document.querySelector('[data-staff-row="tax-citra"]').textContent,/No capacity/);assert.doesNotMatch(d.w.document.body.textContent,/NaN|Infinity/);
  }finally{d.dom.window.close();}
});
test('Tax and Accounting ratings, drafts and not-applicable clients remain independent',()=>{
  const d=demo();try{
    d.change('[data-client="client-1"][data-assess-field="difficulty"]','5');d.change('[data-pic-next="client-1"]','tax-bima');
    d.click('[data-team="acc"]');
    assert.equal(d.w.document.querySelector('[data-client="client-1"][data-assess-field="difficulty"]').value,'2');
    assert.equal(d.w.document.querySelector('[data-client="client-11"][data-assess-field="hours"]').disabled,true);
    assert.match(d.w.document.querySelector('[data-client-row="client-11"]').textContent,/Not applicable/);
    d.change('[data-pic-next="client-2"]','acc-farah');assert.equal(d.api.changes().length,2);
    d.click('#review-plan');assert.match(d.w.document.querySelector('#review-content').textContent,/Tax[\s\S]*Accounting/);
  }finally{d.dom.window.close();}
});
test('No PIC is an explicit pending choice; reset clears hidden-team drafts but retains assessments',()=>{
  const d=demo();try{
    d.change('[data-client="client-1"][data-assess-field="hours"]','25');d.change('[data-pic-next="client-1"]','none');
    assert.equal(d.api.changes()[0].to,null);assert.equal(d.api.getData().clients[0].tax.pic,'tax-citra');
    d.click('[data-team="acc"]');d.change('[data-pic-next="client-2"]','acc-farah');d.click('#reset-plan');
    assert.equal(d.api.changes().length,0);assert.equal(d.api.getData().clients[0].tax.hours,25);assert.equal(d.api.getData().clients[0].tax.pic,'tax-citra');
  }finally{d.dom.window.close();}
});
test('bulk selection stages only visible applicable clients and changes only the selected team',()=>{
  const d=demo();try{
    d.click('[data-team="acc"]');d.click('#select-all');d.change('#bulk-pic','acc-farah');
    assert.equal(d.api.changes().length,7);assert.ok(d.api.changes().every((c:any)=>c.team==='acc'));
    assert.equal(d.api.getData().clients[10].acc.pic,null);assert.equal(d.api.getData().clients[0].tax.pic,'tax-citra');
    d.click('#reset-plan');d.click('[data-filter-pic="acc-dian"]');d.click('#select-all');d.change('#bulk-pic','acc-eka');
    assert.equal(d.api.changes().length,4);
  }finally{d.dom.window.close();}
});
test('senior reviewer can assess but cannot allocate or change staff capacity; staff are read-only',()=>{
  const d=demo();try{
    d.change('#role','reviewer');d.change('[data-client="client-1"][data-assess-field="difficulty"]','4');
    assert.equal(d.api.getData().clients[0].tax.difficulty,4);assert.equal(d.api.stage('client-1','tax','tax-bima'),false);
    d.change('[data-staff="tax-bima"][data-staff-field="capacity"]','300');assert.equal(d.api.getData().staff.find((p:any)=>p.id==='tax-bima').capacity,100);
    d.change('#role','staff');d.change('[data-client="client-1"][data-assess-field="hours"]','100');assert.equal(d.api.getData().clients[0].tax.hours,24);
    assert.equal(d.w.document.querySelector('[data-pic-next="client-1"]').disabled,true);
  }finally{d.dom.window.close();}
});
test('stale reviews cannot apply, negative values are rejected and assessment notes are escaped',()=>{
  const d=demo();try{
    d.change('[data-client="client-1"][data-assess-field="hours"]','-1');assert.equal(d.api.getData().clients[0].tax.hours,24);
    d.change('[data-client="client-1"][data-assess-field="note"]','<img src=x onerror="alert(1)">');assert.equal(d.w.document.querySelectorAll('img').length,0);
    d.change('[data-pic-next="client-1"]','tax-bima');d.click('#review-plan');
    d.change('[data-client="client-1"][data-assess-field="hours"]','30');d.submit();
    assert.match(d.w.document.querySelector('#review-error').textContent,/plan changed/);assert.equal(d.api.getData().clients[0].tax.pic,'tax-citra');
    assert.doesNotMatch(read('public/allocation-capacity-demo.js'),/fetch\s*\(|localStorage|sessionStorage|\/api\//);
  }finally{d.dom.window.close();}
});
