import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
const html=readFileSync(new URL("../public/cases-workflow-mockup.html",import.meta.url),"utf8");
const script=readFileSync(new URL("../public/cases-workflow-mockup.js",import.meta.url),"utf8");
function preview(){
  const dom=new JSDOM(html,{runScripts:"outside-only"}),w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
  (w as any).fetch=()=>{throw new Error("No live requests in mockup");};w.eval(script);
  const click=(selector:string)=>{const el=w.document.querySelector<HTMLButtonElement>(selector);assert.ok(el,selector);el.click();};
  const input=(selector:string,value:string)=>{const el=w.document.querySelector<HTMLInputElement>(selector);assert.ok(el,selector);el.value=value;};
  const change=(selector:string)=>w.document.querySelector(selector)!.dispatchEvent(new w.Event("change",{bubbles:true}));
  const choose=(index:number,amount:string,revise=true)=>{
    w.document.querySelector<HTMLInputElement>('[data-product-choice="'+index+'"]')!.checked=true;change('[data-product-choice="'+index+'"]');
    input('[name="amount-'+index+'"]',amount);w.document.querySelector<HTMLInputElement>('[name="revise-'+index+'"]')!.checked=revise;
  };
  const submit=()=>w.document.querySelector("#entry-form")!.dispatchEvent(new w.Event("submit",{bubbles:true,cancelable:true}));
  const text=()=>w.document.querySelector("#case-rows")!.textContent!;
  const error=()=>w.document.querySelector("#form-error")!.textContent!;
  return {dom,w,click,input,change,choose,submit,text,error};
}
function recordBA(d:ReturnType<typeof preview>){
  d.click('[data-result="CASE-DEMO-001"]');d.input('[name="proof"]',"BA-DEMO-NEW");d.input('[name="result"]',"AR discussion concluded.");
  d.choose(0,"1.000");d.input('[name="target"]',"2026-11-03");d.input('[name="revisionTarget"]',"2026-11-03");d.submit();
}

test("completing linked My Work adds one sourced timeline entry without bypassing case gates",()=>{
  const d=preview();try{
    const task='[data-task-done="TASK-DEMO-002"]',entry='[data-timeline-task="TASK-DEMO-002"]';
    assert.equal(d.w.document.querySelectorAll(entry).length,0);
    d.click(task);
    assert.equal(d.w.document.querySelectorAll(entry).length,1);
    assert.match(d.w.document.querySelector(entry)!.textContent!,/Harry \/ Tax \/ 03\/11\/2026/);
    assert.match(d.w.document.querySelector(entry)!.textContent!,/My Work/);
    d.change(task);d.click('[data-detail-tab="payments"]');d.click('[data-detail-tab="progress"]');
    assert.equal(d.w.document.querySelectorAll(entry).length,1);
    assert.match(d.w.document.querySelector('[data-case-row="CASE-DEMO-001"]')!.textContent!,/Progress \/ BA pending/);
    d.click('[data-select="CASE-DEMO-002"]');assert.equal(d.w.document.querySelectorAll(entry).length,0);
    assert.equal(d.w.document.querySelector('#category-tabs a')!.getAttribute('href'),'cases-assessment-mockup.html');
  }finally{d.dom.window.close();}
});

test("new linked tasks enter timeline only on completion and render titles safely",()=>{
  const d=preview();try{
    d.input('[name="taskTitle"]','<img src=x onerror="alert(1)">');d.input('[name="taskTeam"]','Tax');
    d.w.document.querySelector('#linked-task-form')!.dispatchEvent(new d.w.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(d.w.document.querySelectorAll('[data-timeline-task="TASK-DEMO-003"]').length,0);
    d.click('[data-task-done="TASK-DEMO-003"]');
    assert.equal(d.w.document.querySelectorAll('[data-timeline-task="TASK-DEMO-003"]').length,1);
    assert.match(d.w.document.querySelector('[data-timeline-task="TASK-DEMO-003"]')!.textContent!,/<img src=x/);
    assert.equal(d.w.document.querySelectorAll('#case-rows img').length,0);
    d.click('#reset-demo');assert.equal(d.w.document.querySelectorAll('[data-timeline-task="TASK-DEMO-003"]').length,0);
  }finally{d.dom.window.close();}
});
test("Excel register opens Progress with timeline, and has no live persistence",()=>{
  const d=preview();try{
    assert.deepEqual([...d.w.document.querySelectorAll(".case-table>thead th")].map(th=>th.textContent),["No.","Wajib Pajak","No Surat","Tgl Surat","Tgl Terima","Perihal","Tahun","Jatuh Tempo","PIC Tax","PIC ACC","BA / Hasil","Status"]);
    assert.ok(d.w.document.querySelector('[data-cell="letter"]'));assert.match(d.text(),/Case timeline/);
    assert.equal(d.w.document.querySelector('[data-detail-tab="progress"]')!.textContent,"Progress");
    assert.doesNotMatch(script,/fetch\s*\(|localStorage|sessionStorage|\/api\//);
  }finally{d.dom.window.close();}
});
test("BA byproducts populate Payments exactly without final case closure",()=>{
  const d=preview();try{
    d.click('[data-result="CASE-DEMO-001"]');d.input('[name="proof"]',"BA-DEMO-BREAKDOWN");d.input('[name="result"]',"Agreed tax breakdown.");
    assert.equal(d.w.document.querySelector<HTMLInputElement>('[name="date"]')!.value,"03/11/2026");
    assert.equal(d.w.document.querySelector<HTMLInputElement>('[name="target"]')!.value,"07/11/2026");
    for(let i=0;i<5;i++)d.choose(i,String((i+1)*1000));d.submit();
    assert.equal(d.w.document.querySelector("#entry-dialog")!.hasAttribute("open"),false);
    assert.equal(d.w.document.querySelectorAll(".sheet-table tbody tr").length,5);
    for(const name of ["PPh Pasal 29","PPh Pasal 21","PPh Pasal 23","PPh Pasal 4 ayat (2)","PPN"])assert.ok(d.text().includes(name));
    assert.match(d.text(),/Rp15\.000/);assert.match(d.text(),/Awaiting payment/);
    d.click('[data-detail-tab="tax"]');assert.equal(d.w.document.querySelector<HTMLButtonElement>("[data-filing]")!.disabled,true);
    assert.equal(d.w.document.querySelector<HTMLButtonElement>("[data-final]")!.disabled,true);
  }finally{d.dom.window.close();}
});
test("invalid BA is rejected atomically before discussion closure or payable creation",()=>{
  const d=preview();try{
    d.click('[data-result="CASE-DEMO-001"]');d.input('[name="proof"]',"BA-DEMO-X");d.input('[name="result"]',"Test");d.submit();
    assert.match(d.error(),/Select at least/);d.choose(0,"-1");d.submit();assert.match(d.error(),/non-negative/);
    d.input('[name="amount-0"]',"1000");d.input('[name="outcome"]',"No additional tax");d.submit();assert.match(d.error(),/cannot have positive/);
    assert.match(d.w.document.querySelector('[data-case-row="CASE-DEMO-001"]')!.textContent!,/Progress \/ BA pending/);
  }finally{d.dom.window.close();}
});
test("BA-payment-revision-SP3P2DK sequence only closes on final AR document",()=>{
  const d=preview();try{
    recordBA(d);d.click('[data-payment="CASE-DEMO-001-tax-0-schedule-1"]');d.input('[name="proof"]',"NTPN-DEMO-NEW");d.submit();
    assert.match(d.w.document.querySelector('[data-case-row="CASE-DEMO-001"]')!.textContent!,/Paid \/ revision pending/);
    d.click('[data-detail-tab="tax"]');assert.match(d.text(),/Supervisor attention/);
    assert.equal(d.w.document.querySelector<HTMLButtonElement>("[data-final]")!.disabled,true);
    d.click('[data-filing="CASE-DEMO-001-tax-0"]');d.input('[name="proof"]',"FILING-DEMO-NEW");d.submit();
    assert.match(d.w.document.querySelector('[data-case-row="CASE-DEMO-001"]')!.textContent!,/Awaiting SP3P2DK/);
    d.click("[data-final]");d.input('[name="proof"]',"");d.submit();assert.match(d.error(),/document number/);
    d.input('[name="proof"]',"SP3P2DK-DEMO-NEW");d.input('[name="date"]',"2026-11-02");d.submit();assert.match(d.error(),/cannot precede/);
    d.input('[name="date"]',"2026-11-03");d.submit();
    assert.match(d.w.document.querySelector('[data-case-row="CASE-DEMO-001"]')!.textContent!,/Closed/);
    d.click('[data-detail-tab="progress"]');assert.match(d.text(),/BA-DEMO-NEW/);assert.match(d.text(),/SP3P2DK-DEMO-NEW/);
  }finally{d.dom.window.close();}
});
test("unpaid case cannot submit Tax execution or close through manually dispatched disabled actions",()=>{
  const d=preview();try{
    d.click('[data-select="CASE-DEMO-002"]');d.click('[data-detail-tab="tax"]');
    for(const selector of ["[data-filing]","[data-final]"]){
      d.w.document.querySelector(selector)!.dispatchEvent(new d.w.MouseEvent("click",{bubbles:true}));
      assert.equal(d.w.document.querySelector("#entry-dialog")!.hasAttribute("open"),false);
    }
    assert.match(d.text(),/waiting for all payable items/);
  }finally{d.dom.window.close();}
});
test("partial/unverified payments retain balances and verification does not duplicate receipts",()=>{
  const d=preview();try{
    d.click('[data-select="CASE-DEMO-002"]');d.click('[data-detail-tab="payments"]');d.click('[data-payment="s21"]');
    d.input('[name="amount"]',"6.000.000");d.input('[name="proof"]',"DEMO-X");d.submit();assert.match(d.error(),/cannot exceed/);
    d.input('[name="amount"]',"5.000.000");d.input('[name="proof"]',"");d.submit();assert.match(d.error(),/receipt/);
    d.w.document.querySelector<HTMLInputElement>('[name="verified"]')!.checked=false;d.submit();assert.match(d.text(),/Rp15\.000\.000/);
    assert.equal(d.w.document.querySelectorAll(".receipt-line").length,2);
    d.click("[data-verify]");d.input('[name="proof"]',"DEMO-VERIFIED");d.submit();assert.match(d.text(),/Rp10\.000\.000/);
    assert.equal(d.w.document.querySelectorAll(".receipt-line").length,2);
    d.click('[data-detail-tab="tax"]');assert.equal(d.w.document.querySelector<HTMLButtonElement>("[data-filing]")!.disabled,true);
  }finally{d.dom.window.close();}
});
test("paid-but-unsubmitted revisions surface to supervisor in filter and reminder preview",()=>{
  const d=preview();try{
    d.input("#attention-filter","supervisor");d.change("#attention-filter");
    assert.equal(d.w.document.querySelectorAll("[data-case-row]").length,1);assert.match(d.text(),/Lestari/);
    d.click("#open-reminders");assert.match(d.w.document.querySelector("#reminder-list")!.textContent!,/Supervisor attention: paid, revision not submitted/);
    assert.match(d.w.document.querySelector("#reminder-list")!.textContent!,/Ita/);
  }finally{d.dom.window.close();}
});
test("per-byproduct instalments preserve exact totals/month ends and cannot replace paid history",()=>{
  const d=preview();try{
    d.click('[data-select="CASE-DEMO-002"]');d.click('[data-detail-tab="payments"]');d.click("[data-plan]");
    d.input('[name="productId"]',"p21");d.submit();assert.match(d.error(),/Receipts already exist/);
    d.input('[name="productId"]',"p22");d.input('[name="date"]',"2027-01-31");d.submit();
    for(const part of ["31/01/2027","28/02/2027","31/03/2027","Rp3.333.334"])assert.ok(d.text().includes(part));
    assert.equal(d.w.document.querySelectorAll(".sheet-table tbody tr").length,4);
  }finally{d.dom.window.close();}
});
test("confirmed nil still needs final Himbauan document and differs from an unknown BA amount",()=>{
  const d=preview();try{
    d.click('[data-result="CASE-DEMO-001"]');d.input('[name="proof"]',"BA-DEMO-NIL");d.input('[name="result"]',"No additional tax or revision.");
    d.input('[name="outcome"]',"No additional tax");d.submit();assert.match(d.text(),/No payment required/);
    d.click('[data-detail-tab="tax"]');assert.equal(d.w.document.querySelector<HTMLButtonElement>("[data-final]")!.disabled,false);
    assert.doesNotMatch(d.w.document.querySelector('[data-case-row="CASE-DEMO-001"]')!.textContent!,/Closed/);
  }finally{d.dom.window.close();}
});
test("Pemeriksaan navigation opens the revised SPHP and shared assessment preview",()=>{
  const d=preview();try{
    assert.equal(d.w.document.querySelector('#category-tabs a')!.getAttribute('href'),'cases-assessment-mockup.html');
    const updated=readFileSync(new URL('../public/cases-assessment-mockup.html',import.meta.url),'utf8');
    assert.match(updated,/cases-assessment-panels.js/);assert.match(updated,/SPHP No/);assert.match(updated,/Penalty Removal/);
    assert.equal(d.w.document.querySelector('[data-category="pemeriksaan"]'),null);
  }finally{d.dom.window.close();}
});
test("day-first register dates validate, progress text is escaped and reset restores samples",()=>{
  const d=preview();try{
    const selector='[data-case="CASE-DEMO-001"][data-cell="letterDate"]';
    d.input(selector,"31/02/2026");d.change(selector);assert.equal(d.w.document.querySelector<HTMLInputElement>(selector)!.value,"20/10/2026");
    d.input(selector,"25/10/2026");d.change(selector);assert.equal(d.w.document.querySelector<HTMLInputElement>(selector)!.value,"25/10/2026");
    d.input('[name="entry"]','<img src=x onerror="alert(1)">');
    d.w.document.querySelector("#followup-form")!.dispatchEvent(new d.w.Event("submit",{bubbles:true,cancelable:true}));
    assert.equal(d.w.document.querySelectorAll("#case-rows img").length,0);assert.match(d.text(),/<img src=x/);
    d.click("#reset-demo");assert.equal(d.w.document.querySelectorAll("[data-case-row]").length,4);
  }finally{d.dom.window.close();}
});

test('Himbauan BA action is left of In progress and incorrect manual updates are recoverable',()=>{
  const d=preview();try{
    const status=d.w.document.querySelector('.detail-status')!;
    assert.match(status.firstElementChild!.textContent!,/Record BA & close discussion/);assert.equal(status.lastElementChild!.textContent,'In progress');
    assert.equal(d.w.document.querySelector('.progress-side [data-result]'),null);
    d.input('[name="entry"]','Incorrect follow-up for another case');
    d.w.document.querySelector('#followup-form')!.dispatchEvent(new d.w.Event('submit',{bubbles:true,cancelable:true}));
    d.click('[data-remove-progress]');assert.doesNotMatch(d.w.document.querySelector('.timeline')!.textContent!,/Incorrect follow-up/);
    assert.match(d.w.document.querySelector('.removed-updates')!.textContent!,/Incorrect follow-up/);
    d.click('[data-restore-progress]');assert.match(d.w.document.querySelector('.timeline')!.textContent!,/Incorrect follow-up/);
    d.click('[data-task-done="TASK-DEMO-002"]');assert.equal(d.w.document.querySelector('[data-timeline-task="TASK-DEMO-002"] [data-remove-progress]'),null);
    assert.match(d.w.document.querySelector('[data-case-row="CASE-DEMO-001"]')!.textContent!,/Progress \/ BA pending/);
  }finally{d.dom.window.close();}
});
