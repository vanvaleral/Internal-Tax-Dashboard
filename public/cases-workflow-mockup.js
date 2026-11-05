(() => {
  "use strict";
  const AS_OF = "2026-11-03";
  const TAX_TYPES = ["PPh Pasal 29","PPh Pasal 21","PPh Pasal 23","PPh Pasal 4 ayat (2)","PPN"];
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
  const money = value => "Rp" + Number(value || 0).toLocaleString("id-ID");
  const date = value => value ? value.split("-").reverse().join("/") : "-";
  const icon = name => '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const days = value => Math.round((Date.parse(value + "T00:00:00Z") - Date.parse(AS_OF + "T00:00:00Z")) / 86400000);
  const tag = (text, tone = "") => '<span class="tag ' + tone + '">' + esc(text) + "</span>";
  const wholeAmount = value => {
    const raw = String(value ?? "").trim();
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(raw)) return null;
    const amount = Number(raw.replaceAll(".", ""));
    return Number.isSafeInteger(amount) ? amount : null;
  };
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0,10) === value;
  const parseDate = value => {
    const raw=String(value||"").trim();
    if(validDate(raw)) return raw;
    const match=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const iso=match?match[3]+"-"+match[2].padStart(2,"0")+"-"+match[1].padStart(2,"0"):"";
    return validDate(iso)?iso:"";
  };
  const base = (id, name, overrides = {}) => ({
    id, name, category:"himbauan", letter:"SP2DK / DEMO / " + id.slice(-3), letterDate:"2026-10-20", received:"2026-10-23", due:"2026-11-06",
    subject:"Klarifikasi data SPT", year:"2023", acc:"Dewayu", tax:"Harry", stage:"AR discussion", source:"Internal records and client supporting data collected.",
    ba:null, skp:null, sphp:null, response:null, products:[], schedule:[], payments:[], sp3:null, closed:false, executionTarget:"2026-11-06", tasks:[], log:[], ...overrides
  });
  function seeds() {
    return [
      base("CASE-DEMO-001", "PT Sentosa Demo", {
        tasks:[{ id:"TASK-DEMO-001", title:"Reconcile the client's sales records", actor:"Dewayu / ACC", completedAt:"2026-10-28" },{ id:"TASK-DEMO-002", title:"Prepare the agreed tax revision worksheet", actor:"Harry / Tax", completedAt:null }],
        log:[{ date:"2026-11-02", actor:"Dewayu / ACC", text:"Client agreed with worksheet. Awaiting BA from AR to conclude the discussion." },{ date:"2026-10-30", actor:"Dewayu / ACC", text:"Worksheet discussed with AR; additional sales records explained." },{ date:"2026-10-26", actor:"Dewayu / ACC", text:"Client data received. Worksheet prepared for the relevant tax year." }]
      }),
      base("CASE-DEMO-002", "CV Pesisir Demo", {
        acc:"Cemari", tax:"Denny", ba:{ number:"BA / DEMO / 002", date:"2026-10-29", outcome:"Additional tax / revision", result:"PPh 29 and PPh 21 agreed. Follow payment schedule." },
        products:[{ id:"p21", tax:"PPh Pasal 29", period:"2023", amount:20000000, revise:true, filing:null },{ id:"p22", tax:"PPh Pasal 21", period:"12/2023", amount:10000000, revise:true, filing:null }],
        schedule:[{ id:"s21", productId:"p21", due:"2026-11-02", amount:20000000 },{ id:"s22", productId:"p22", due:"2026-11-10", amount:10000000 }],
        payments:[{ id:"r21", scheduleId:"s21", amount:15000000, date:"2026-11-01", proof:"DEMO-NTPN-021", verified:true }],
        log:[{ date:"2026-11-01", actor:"Denny / Tax", text:"Verified Rp15.000.000 tax payment. Remaining Rp5.000.000 on the first target." },{ date:"2026-10-29", actor:"Cemari / ACC", text:"BA registered: PPh 29 Rp20.000.000 and PPh 21 Rp10.000.000. Discussion completed." }]
      }),
      base("CASE-DEMO-003", "PT Lestari Demo", {
        acc:"Ivan", tax:"Ita", executionTarget:"2026-11-03", ba:{ number:"BA / DEMO / 003", date:"2026-10-30", outcome:"Additional tax / revision", result:"PPh Pasal 23 agreed. Revision required after payment." },
        products:[{ id:"p31", tax:"PPh Pasal 23", period:"10/2023", amount:8000000, revise:true, filing:null }],
        schedule:[{ id:"s31", productId:"p31", due:"2026-11-02", amount:8000000 }],
        payments:[{ id:"r31", scheduleId:"s31", amount:8000000, date:"2026-11-02", proof:"DEMO-NTPN-031", verified:true }],
        log:[{ date:"2026-11-02", actor:"Ita / Tax", text:"All BA tax paid. SPT revision is pending; visible to supervisor." },{ date:"2026-10-30", actor:"Ivan / ACC", text:"BA registered and discussion completed." }]
      }),
      base("CASE-DEMO-004", "PT Harmoni Demo", {
        acc:"Ivan", tax:"Harry", ba:{ number:"BA / DEMO / 004", date:"2026-10-28", outcome:"Additional tax / revision", result:"PPN correction agreed." },
        products:[{ id:"p41", tax:"PPN", period:"09/2023", amount:5000000, revise:true, filing:{ date:"2026-11-02", proof:"DEMO-FILING-041" } }],
        schedule:[{ id:"s41", productId:"p41", due:"2026-11-01", amount:5000000 }],
        payments:[{ id:"r41", scheduleId:"s41", amount:5000000, date:"2026-11-01", proof:"DEMO-NTPN-041", verified:true }],
        log:[{ date:"2026-11-02", actor:"Harry / Tax", text:"Revision submitted. Awaiting SP3P2DK from AR for final closure." },{ date:"2026-11-01", actor:"Harry / Tax", text:"All tax paid and verified." }]
      }),
      base("CASE-DEMO-005", "PT Mandala Demo", {
        category:"pemeriksaan", letter:"PEMERIKSAAN / DEMO / 201", acc:"Cemari", tax:"Denny", stage:"SPHP response",
        sphp:{ number:"SPHP / DEMO / 021", received:"2026-10-26", due:"2026-11-06" },
        log:[{ date:"2026-10-30", actor:"Cemari / ACC", text:"SPHP response being prepared. No assessment registered yet." }]
      }),
      base("CASE-DEMO-006", "PT Samudra Demo", {
        category:"pemeriksaan", letter:"PEMERIKSAAN / DEMO / 202", acc:"Ivan", tax:"Harry",
        sphp:{ number:"SPHP / DEMO / 019", received:"2026-09-20", due:"2026-09-30" }, response:{ date:"2026-09-28", proof:"DEMO-RESPONSE-008" },
        skp:{ number:"SKPKB / DEMO / 015", date:"2026-10-15", outcome:"Additional tax / revision", result:"Assessment separately registered. No automatic SPT-revision requirement." },
        products:[{ id:"p61", tax:"PPh Pasal 29", period:"2022", amount:90000000, revise:false, filing:null }],
        schedule:[{ id:"s61", productId:"p61", due:"2026-11-04", amount:30000000 },{ id:"s62", productId:"p61", due:"2026-12-04", amount:30000000 },{ id:"s63", productId:"p61", due:"2027-01-04", amount:30000000 }],
        log:[{ date:"2026-10-15", actor:"Ivan / ACC", text:"SKPKB registered separately from SPHP. Payment follow-up assigned to Tax." }]
      })
    ];
  }
  let cases = seeds(), category = "himbauan", selected = cases[0].id, detailTab = "progress", context = null, toastTimer, taskSequence = 2;
  const current = () => cases.find(item => item.id === selected);
  const resultDoc = item => item.category === "himbauan" ? item.ba : item.skp;
  const total = item => resultDoc(item) ? item.products.reduce((sum,p) => sum + p.amount,0) : null;
  const paid = item => item.payments.filter(p => p.verified).reduce((sum,p) => sum + p.amount,0);
  const balance = item => total(item) === null ? null : Math.max(0,total(item) - paid(item));
  const schedulePaid = (item, s) => item.payments.filter(p => p.verified && p.scheduleId === s.id).reduce((sum,p) => sum + p.amount,0);
  const remaining = (item,s) => Math.max(0,s.amount - schedulePaid(item,s));
  const settled = item => Boolean(resultDoc(item)) && balance(item) === 0;
  const revisions = item => item.products.filter(p => p.revise);
  const executed = item => settled(item) && revisions(item).every(p => p.filing);
  const supervisor = item => !item.closed && settled(item) && !executed(item);
  const awaitingSP3 = item => item.category === "himbauan" && executed(item) && !item.sp3;
  const overdue = item => item.schedule.some(s => remaining(item,s) > 0 && days(s.due) < 0);
  const dueSoon = item => item.schedule.some(s => remaining(item,s) > 0 && days(s.due) <= 7);
  const log = (item,text,actor = item.tax + " / Tax") => item.log.unshift({ date:AS_OF,actor,text });
  const stage = item => item.closed ? "Closed" : !resultDoc(item) ? item.category === "himbauan" ? "Progress / BA pending" : "SPHP / SKP pending" : !settled(item) ? overdue(item) ? "Payment overdue" : "Awaiting payment" : !executed(item) ? "Paid / revision pending" : item.category === "himbauan" ? "Awaiting SP3P2DK" : "Ready for closure";
  function toast(text) { clearTimeout(toastTimer); $("#toast").textContent=text; $("#toast").classList.add("visible"); toastTimer=setTimeout(() => $("#toast").classList.remove("visible"),3500); }
  function reminders() {
    const items=[];
    for (const item of cases.filter(c => !c.closed)) {
      for (const s of item.schedule) if (remaining(item,s)>0 && days(s.due)<=7) items.push({ item, due:s.due, late:days(s.due)<0, title:(days(s.due)<0?"Overdue payment: ":"Payment target: ")+money(remaining(item,s)), text:"Tax PIC "+item.tax+". Follow up client and verify the tax receipt." });
      if (supervisor(item)) items.push({ item,due:item.executionTarget,late:days(item.executionTarget)<0,title:"Supervisor attention: paid, revision not submitted",text:"Tax PIC "+item.tax+". "+revisions(item).filter(p=>!p.filing).map(p=>p.tax+" / "+p.period).join(", ")+". No live notification is sent by this mockup." });
      if (awaitingSP3(item)) items.push({ item,due:AS_OF,late:false,title:"Awaiting SP3P2DK from AR",text:"All payments and required revisions complete. Record the AR document to close the case." });
      if (item.sphp && !item.response) items.push({ item,due:item.sphp.due,late:days(item.sphp.due)<0,title:"SPHP response pending",text:"Record the response separately from the resulting assessment." });
    }
    return items.sort((a,b)=>a.due.localeCompare(b.due));
  }
  function visibleCases() {
    const q=$("#search").value.trim().toLowerCase(),acc=$("#acc-filter").value,tax=$("#tax-filter").value,filter=$("#attention-filter").value;
    return cases.filter(c=>c.category===category && (!q || [c.name,c.letter,c.acc,c.tax].join(" ").toLowerCase().includes(q)) && (!acc||c.acc===acc) && (!tax||c.tax===tax) && (filter!=="supervisor"||supervisor(c)) && (filter!=="payment"||dueSoon(c)) && (filter!=="closure"||awaitingSP3(c)));
  }
  function cell(item,key,value) {
    return '<input class="cell-input" data-cell="'+key+'" data-case="'+item.id+'" aria-label="'+esc(key+" / "+item.name)+'" value="'+esc(value)+'">';
  }
  function render() {
    $("#category-tabs").innerHTML=[["himbauan","Himbauan / SP2DK"],["pemeriksaan","Pemeriksaan"]].map(([id,label])=>'<button role="tab" data-category="'+id+'" aria-selected="'+(id===category)+'">'+label+'<span class="count">'+cases.filter(c=>c.category===id).length+"</span></button>").join("");
    const all=cases.filter(c=>c.category===category),rows=visibleCases();
    $("#visible-count").textContent=rows.length+" of "+all.length+" cases";
    $("#reminder-count").textContent=reminders().length;
    $("#scan-summary").innerHTML='<span><b>'+rows.length+'</b>cases</span><span class="urgent"><b>'+rows.filter(supervisor).length+'</b>supervisor attention</span><span><b>'+rows.filter(awaitingSP3).length+'</b>awaiting SP3P2DK</span>';
    $("#case-rows").innerHTML=rows.map(c=>{
      const doc=resultDoc(c);
      return '<tr class="case-row '+(selected===c.id?"selected":"")+'" data-case-row="'+c.id+'"><td><button class="row-toggle" data-select="'+c.id+'" aria-expanded="'+(selected===c.id)+'" aria-label="Expand '+esc(c.name)+'">'+(all.indexOf(c)+1)+icon("chevron")+'</button></td><td><button class="client-link" data-select="'+c.id+'">'+esc(c.name)+'</button></td><td>'+cell(c,"letter",c.letter)+'</td><td>'+cell(c,"letterDate",date(c.letterDate))+'</td><td>'+cell(c,"received",date(c.received))+'</td><td>'+cell(c,"subject",c.subject)+'</td><td>'+c.year+'</td><td>'+date(c.due)+'</td><td>'+esc(c.tax)+'</td><td>'+esc(c.acc)+'</td><td>'+(doc?'<button class="text-button" style="padding:0;white-space:normal;text-align:left" data-open-progress="'+c.id+'">'+esc(doc.number)+'</button>':'<button class="small-action" data-result="'+c.id+'">'+(c.category==="himbauan"?"Record BA":"Record SKP")+'</button>')+'</td><td>'+tag(stage(c),c.closed?"green":supervisor(c)||overdue(c)?"amber":"")+'</td></tr>'+(selected===c.id?'<tr><td class="detail-cell" colspan="12">'+detail(c)+'</td></tr>':"");
    }).join("") || '<tr><td colspan="12" class="empty">No cases match these filters.</td></tr>';
  }
  function detail(item) {
    return '<div class="case-detail"><div class="detail-heading"><h2>'+esc(item.name)+'<span class="case-id">'+item.id+" / "+item.year+'</span></h2><span class="muted">'+esc(stage(item))+'</span></div><div class="detail-tabs" role="tablist" aria-label="Case detail">'+[["progress","Progress"],["payments","Payments & Instalments"],["tax","Tax Execution"]].map(([id,label])=>'<button role="tab" data-detail-tab="'+id+'" aria-selected="'+(detailTab===id)+'">'+label+"</button>").join("")+'</div>'+(detailTab==="progress"?progress(item):detailTab==="payments"?payments(item):execution(item))+"</div>";
  }
  function timelineMarkup(item) {
    // Project completed linked tasks instead of copying them into the manual log.
    const events=[...item.log, ...item.tasks.filter(task=>task.completedAt).map(task=>({ date:task.completedAt, actor:task.actor, text:task.title, taskId:task.id }))].sort((a,b)=>b.date.localeCompare(a.date));
    return '<section><div class="section-head"><h3>Case timeline</h3><span class="muted">'+events.length+' updates / ACC + Tax</span></div><div class="timeline">'+events.map(e=>'<div class="timeline-item"'+(e.taskId?' data-timeline-task="'+esc(e.taskId)+'"':'')+'>'+esc(e.text)+'<small>'+esc(e.actor)+' / '+date(e.date)+(e.taskId?' / '+tag('My Work','green')+' / '+esc(e.taskId):' / Manual or case action')+'</small></div>').join('')+'</div><p class="workflow-note">Completed linked My Work tasks appear here automatically. No need to enter the same update twice.</p><details class="linked-work"><summary>My Work preview ('+item.tasks.filter(task=>!task.completedAt).length+' open)</summary><p class="workflow-note">Demo only. These tasks are linked to '+esc(item.name)+'. Completing a task adds progress, not payment or filing evidence.</p><div class="linked-task-list">'+item.tasks.map(task=>'<label class="linked-task"><input type="checkbox" data-task-done="'+esc(task.id)+'" aria-label="Complete '+esc(task.title)+'" '+(task.completedAt?'checked disabled':'')+'><span>'+esc(task.title)+'<small>'+esc(task.actor)+' / '+esc(task.id)+(task.completedAt?' / Completed '+date(task.completedAt):' / Open')+'</small></span></label>').join('')+'</div><form id="linked-task-form" class="followup-form"><input name="taskTitle" required maxlength="200" aria-label="New linked My Work task" placeholder="New linked My Work task..." '+(item.closed?'disabled':'')+'><select name="taskTeam" aria-label="Task PIC"><option value="ACC">'+esc(item.acc)+' / ACC</option><option value="Tax">'+esc(item.tax)+' / Tax</option></select><button class="secondary" type="submit" '+(item.closed?'disabled':'')+'>Add task</button></form></details><form id="followup-form" class="followup-form"><textarea name="entry" maxlength="1000" required aria-label="Progress update" placeholder="Discussion result or extra context not recorded in My Work..."></textarea><select name="team" aria-label="Recorded by"><option value="ACC">'+esc(item.acc)+' / ACC</option><option value="Tax">'+esc(item.tax)+' / Tax</option></select><button class="secondary" type="submit">Add update</button></form></section>';
  }
  function progress(item) {
    const doc=resultDoc(item);
    return '<div class="progress-layout">'+timelineMarkup(item)+'<section class="progress-side"><div class="section-head"><h3>'+(item.category==="himbauan"?"Discussion closure / BA":"SPHP / assessment")+'</h3></div>'+(doc?'<dl class="kv"><dt>'+(item.ba?"BA reference":"SKP reference")+'</dt><dd>'+esc(doc.number)+'</dd><dt>Date</dt><dd>'+date(doc.date)+'</dd><dt>Result</dt><dd>'+esc(doc.result)+'</dd><dt>Total payable</dt><dd>'+money(total(item))+'</dd></dl><table class="product-summary"><thead><tr><th>Byproduct</th><th>Period</th><th>Payable</th></tr></thead><tbody>'+item.products.map(p=>'<tr><td>'+esc(p.tax)+'</td><td>'+esc(p.period)+'</td><td>'+money(p.amount)+"</td></tr>").join("")+'</tbody></table><p class="workflow-note">'+(item.ba?"BA closes the discussion, not the whole case. Continue with payments, required revisions, then SP3P2DK.":"Assessment remains distinct from SPHP. No SPT revision is assumed unless explicitly recorded.")+'</p>':'<p class="muted">'+esc(item.source)+'</p><p class="workflow-note">'+(item.category==="himbauan"?"When AR issues the BA, register its result and the payable tax byproducts. The payment sheet will be populated automatically.":"Record the SPHP response and resulting SKP separately.")+'</p><button class="primary" style="margin-top:10px" data-result="'+item.id+'">'+(item.category==="himbauan"?"Record BA & close discussion":"Record SKP result")+'</button>')+(item.sphp?'<dl class="kv" style="margin-top:14px"><dt>SPHP</dt><dd>'+esc(item.sphp.number)+'</dd><dt>Response due</dt><dd>'+date(item.sphp.due)+'</dd><dt>Response</dt><dd>'+(item.response?esc(item.response.proof)+" / "+date(item.response.date):'<button class="small-action" data-response>Record response</button>')+'</dd></dl>':"")+(item.closed?'<p class="workflow-note">'+tag("Case closed","green")+" "+esc(item.sp3?.number||item.closure?.number)+" / "+date(item.sp3?.date||item.closure?.date)+"</p>":"")+"</section></div>";
  }
  function paymentTable(item) {
    return '<div class="inner-sheet"><table class="sheet-table"><thead><tr><th>Tax byproduct</th><th>Period</th><th>No.</th><th>Payment target</th><th>Scheduled</th><th>Verified paid</th><th>Remaining</th><th>Action</th></tr></thead><tbody>'+item.schedule.map((s,index)=>{
      const p=item.products.find(p=>p.id===s.productId);
      return '<tr><td>'+esc(p.tax)+'</td><td>'+esc(p.period)+'</td><td>'+(index+1)+'</td><td>'+date(s.due)+(remaining(item,s)>0&&days(s.due)<0?'<span class="tiny-text" style="color:var(--red)">Overdue target</span>':"")+'</td><td>'+money(s.amount)+'</td><td>'+money(schedulePaid(item,s))+'</td><td>'+money(remaining(item,s))+'</td><td>'+(remaining(item,s)>0?'<button class="small-action" data-payment="'+s.id+'">Record payment</button>':tag("Paid","green"))+"</td></tr>";
    }).join("")+"</tbody></table></div>";
  }
  function payments(item) {
    if (!resultDoc(item)) return '<p class="empty">Record the '+(item.category==="himbauan"?"BA":"SKP")+' result in Progress first. Payable byproducts will appear here.</p>';
    return '<div class="inline-summary"><span>Payable<strong>'+money(total(item))+'</strong></span><span>Verified paid<strong>'+money(paid(item))+'</strong></span><span>Balance<strong>'+money(balance(item))+'</strong></span><div class="actions"><button class="secondary" data-plan '+(total(item)>0?"":"disabled")+'>Set instalments</button>'+(settled(item)?'<button class="small-action" data-detail-tab="tax">Continue to Tax Execution '+icon("arrow")+'</button>':"")+'</div></div>'+(item.schedule.length?paymentTable(item):'<p class="empty">No payment required. Continue with any required revision and the closing document.</p>')+'<p class="workflow-note">Payment targets are an internal plan, not an extension of an official deadline. Only verified tax receipts reduce the balance.</p><details class="receipt-list"><summary>Actual receipts ('+item.payments.length+')</summary>'+item.payments.map(p=>'<div class="receipt-line"><strong>'+money(p.amount)+'</strong><span>'+date(p.date)+'</span><span>'+esc(p.proof||"No receipt reference")+'</span>'+tag(p.verified?"Verified":"Unverified",p.verified?"green":"amber")+(!p.verified?'<button class="small-action" data-verify="'+p.id+'">Verify</button>':"")+'</div>').join("")+"</details>";
  }
  function execution(item) {
    if (!resultDoc(item)) return '<p class="empty">Register the '+(item.category==="himbauan"?"BA":"SKP")+' result first.</p>';
    const canFile=settled(item);
    let html=!canFile?'<p class="status-notice neutral">Tax execution is waiting for all payable items to be fully paid. Preparation can be discussed in Progress; submission controls unlock after settlement.</p>':supervisor(item)?'<p class="status-notice"><strong>Supervisor attention:</strong> all tax has been paid, but '+esc(item.tax)+' has not submitted all required revisions. Target '+date(item.executionTarget)+'.</p>':'<p class="status-notice neutral">'+(item.closed?"Case closed. References remain in the history.":revisions(item).length?"Required revisions submitted. Record the closing document below.":"No revision was specified in the recorded result. Record the closing document after settlement.")+'</p>';
    html+='<div class="inner-sheet"><table class="sheet-table"><thead><tr><th>Tax byproduct</th><th>Period</th><th>Payable</th><th>Revision required</th><th>Submitted</th><th>Filing receipt</th><th>Action</th></tr></thead><tbody>'+item.products.map(p=>'<tr><td>'+esc(p.tax)+'</td><td>'+esc(p.period)+'</td><td>'+money(p.amount)+'</td><td>'+(p.revise?"Yes":"Not required")+'</td><td>'+date(p.filing?.date)+'</td><td>'+esc(p.filing?.proof||"-")+'</td><td>'+(p.revise&&!p.filing?'<button class="small-action" data-filing="'+p.id+'" '+(canFile?"":"disabled")+'>Record submission</button>':tag(p.filing?"Submitted":"Not applicable",p.filing?"green":""))+"</td></tr>").join("")+'</tbody></table></div><div class="inline-summary" style="margin-top:12px"><span>'+ (item.category==="himbauan"?"SP3P2DK":"Examination closure")+'<strong>'+esc(item.sp3?.number||item.closure?.number||"Not recorded")+'</strong></span><span>Date<strong>'+date(item.sp3?.date||item.closure?.date)+'</strong></span><div class="actions"><button class="primary" data-final '+(executed(item)&&!item.closed?"":"disabled")+'>'+(item.closed?"Case closed":item.category==="himbauan"?"Record SP3P2DK & close case":"Record closure")+'</button></div></div><p class="workflow-note">'+(item.category==="himbauan"?"BA concludes the discussion. SP3P2DK is the final closing reference in this proposed Himbauan workflow, after payment and required revisions.":"SP3P2DK is not used for this Pemeriksaan sample. SPHP and SKP references are retained separately.")+'</p>';
    return html;
  }
  function fields(mode,item,id) {
    const referenceFields='<div class="form-row"><label class="field-label">Document number<input name="proof" maxlength="100" required></label><label class="field-label">Document date<input name="date" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" value="'+date(AS_OF)+'" required></label></div>';
    if (mode==="result") return referenceFields+'<label class="field-label">Result<select name="outcome"><option>Additional tax / revision</option><option>No additional tax</option></select></label><label class="field-label">BA / assessment result<textarea name="result" maxlength="1000" required placeholder="What was agreed, and what must be paid or revised?"></textarea></label><div class="product-scroll"><table class="ba-products"><thead><tr><th style="width:34%">Tax byproduct</th><th style="width:19%">Period / year</th><th style="width:29%">Payable (IDR)</th><th>Revise SPT</th></tr></thead><tbody>'+TAX_TYPES.map((tax,index)=>'<tr><td><label class="tax-choice"><input type="checkbox" data-product-choice="'+index+'" name="product-'+index+'">'+tax+'</label></td><td><input type="text" name="period-'+index+'" value="'+item.year+'" aria-label="Period '+tax+'" disabled></td><td><input type="text" inputmode="numeric" name="amount-'+index+'" placeholder="0" aria-label="Payable '+tax+'" disabled></td><td><input type="checkbox" name="revise-'+index+'" aria-label="Revision required '+tax+'" '+(item.category==="himbauan"?"checked":"")+' disabled></td></tr>').join("")+'</tbody></table></div><div class="form-row"><label class="field-label">First payment target (internal)<input type="text" inputmode="numeric" placeholder="dd/mm/yyyy" name="target" value="07/11/2026"></label><label class="field-label">Tax revision target (internal)<input type="text" inputmode="numeric" placeholder="dd/mm/yyyy" name="revisionTarget" value="06/11/2026"></label></div><p class="muted">Selected byproducts populate Payments automatically. Use 0 for a confirmed nil amount. Instalments can be split there before any receipt is recorded. This closes the discussion, not the final case.</p>';
    if (mode==="payment"||mode==="verify") {
      const payment=mode==="verify"?item.payments.find(p=>p.id===id):null;
      const s=item.schedule.find(s=>s.id===(payment?payment.scheduleId:id)),p=item.products.find(p=>p.id===s.productId);
      return '<p class="muted">'+esc(p.tax)+" / "+esc(p.period)+" / Remaining "+money(remaining(item,s))+'</p><label class="field-label">Actual amount paid (IDR)<input name="amount" inputmode="numeric" required value="'+(payment?payment.amount:remaining(item,s)).toLocaleString("id-ID")+'"></label><div class="form-row"><label class="field-label">Payment date<input name="date" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" value="'+date(payment?payment.date:AS_OF)+'" required></label><label class="field-label">NTPN / tax receipt<input name="proof" maxlength="100" value="'+esc(payment?.proof||"")+'"></label></div><label class="verify-label"><input type="checkbox" name="verified" checked>Receipt verified (reduces balance)</label>';
    }
    if (mode==="plan") return '<label class="field-label">Tax byproduct<select name="productId">'+item.products.filter(p=>p.amount>0).map(p=>'<option value="'+p.id+'">'+esc(p.tax)+" / "+esc(p.period)+" / "+money(p.amount)+"</option>").join("")+'</select></label><div class="form-row"><label class="field-label">Number of monthly instalments<input name="count" type="number" min="1" max="12" value="3" required></label><label class="field-label">First internal target<input name="date" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" value="07/11/2026" required></label></div><p class="muted">Equal whole-rupiah splits; final instalment absorbs rounding. A byproduct with recorded receipts cannot be rescheduled in this mockup.</p>';
    if (mode==="filing") return '<p class="muted">'+esc(item.products.find(p=>p.id===id).tax)+" / "+esc(item.products.find(p=>p.id===id).period)+'</p><div class="form-row"><label class="field-label">Submission date<input name="date" type="text" inputmode="numeric" placeholder="dd/mm/yyyy" value="'+date(AS_OF)+'" required></label><label class="field-label">Filing receipt / NTTE<input name="proof" maxlength="100" required></label></div>';
    if (mode==="final") return referenceFields+'<p class="muted">'+(item.category==="himbauan"?"SP3P2DK issued by AR is recorded after all payments and required revisions. Saving this reference closes the case in the preview.":"Record the examination closure reference; SP3P2DK is not used for this case type.")+'</p>';
    return referenceFields+'<p class="muted">Response submission only. This does not create an SKP or tax payable.</p>';
  }
  function openEntry(mode,id) {
    const item=current(); if (!item) return;
    if (mode==="filing"&&!settled(item)) return toast("Complete and verify all payments before Tax submission.");
    if (mode==="final"&&(!executed(item)||item.closed)) return toast("Payments and required revisions must be complete before closure.");
    if (mode==="result"&&resultDoc(item)) return toast("Result already recorded. Reset the demo to try a different result.");
    context={ mode,id,caseId:item.id };
    $("#entry-dialog").classList.toggle("wide",mode==="result");
    $("#dialog-title").textContent=mode==="result"?(item.category==="himbauan"?"Record BA & close discussion":"Record SKP result"):mode==="plan"?"Set instalments":mode==="filing"?"Record Tax submission":mode==="final"?(item.category==="himbauan"?"Record SP3P2DK & close case":"Close examination"):mode==="response"?"Record SPHP response":mode==="verify"?"Verify tax receipt":"Record tax payment";
    $("#dialog-kicker").textContent=item.name+" / DEMO";
    $("#form-error").textContent=""; $("#dialog-fields").innerHTML=fields(mode,item,id); $("#entry-dialog").showModal();
  }
  function nextMonth(start,index) {
    const initial=new Date(start+"T00:00:00Z"),day=initial.getUTCDate();
    initial.setUTCDate(1); initial.setUTCMonth(initial.getUTCMonth()+index);
    const last=new Date(Date.UTC(initial.getUTCFullYear(),initial.getUTCMonth()+1,0)).getUTCDate();
    initial.setUTCDate(Math.min(day,last)); return initial.toISOString().slice(0,10);
  }
  $("#entry-form").addEventListener("submit",event=>{
    event.preventDefault();
    const item=cases.find(c=>c.id===context.caseId),form=new FormData(event.target),mode=context.mode;
    const proof=String(form.get("proof")||"").trim(),submitted=parseDate(form.get("date"));
    const fail=text=>{ $("#form-error").textContent=text; };
    if (!validDate(submitted)||(mode!=="plan"&&submitted>AS_OF)) return fail("Use a valid actual date on or before 03/11/2026.");
    if (mode==="result") {
      if (resultDoc(item)) return fail("A result is already recorded.");
      const result=String(form.get("result")||"").trim(),outcome=String(form.get("outcome")||"");
      if (!proof||!result) return fail("Document number and result are required.");
      const products=[];
      for (let i=0;i<TAX_TYPES.length;i++) if (form.get("product-"+i)==="on") {
        const amount=wholeAmount(form.get("amount-"+i)),period=String(form.get("period-"+i)||"").trim();
        if (amount===null||!period) return fail("Each selected byproduct needs a period and a valid non-negative whole-rupiah amount.");
        products.push({ id:item.id+"-tax-"+i,tax:TAX_TYPES[i],period,amount,revise:form.get("revise-"+i)==="on",filing:null });
      }
      if (outcome==="Additional tax / revision"&&!products.length) return fail("Select at least one tax byproduct.");
      const amount=products.reduce((sum,p)=>sum+p.amount,0);
      if (!Number.isSafeInteger(amount)) return fail("Total amount is too large.");
      if (outcome==="No additional tax"&&amount>0) return fail("No additional tax cannot have positive payable amounts.");
      const target=parseDate(form.get("target")),revisionTarget=parseDate(form.get("revisionTarget"));
      if (amount>0&&!validDate(target)) return fail("Enter the first internal payment target.");
      if (products.some(p=>p.revise)&&!validDate(revisionTarget)) return fail("Enter a Tax revision target.");
      const doc={number:proof,date:submitted,outcome,result};
      if (item.category==="himbauan") item.ba=doc; else item.skp=doc;
      item.products=products; item.schedule=products.filter(p=>p.amount>0).map(p=>({id:p.id+"-schedule-1",productId:p.id,due:target,amount:p.amount}));
      item.executionTarget=revisionTarget||AS_OF;
      log(item,(item.ba?"BA":"SKP")+" "+proof+" registered. "+result+" Payable "+money(amount)+".",item.acc+" / ACC");
      detailTab="payments";
    } else if (mode==="payment"||mode==="verify") {
      if (item.closed) return fail("Closed case cannot receive new payment entries.");
      const existing=mode==="verify"?item.payments.find(p=>p.id===context.id):null;
      const s=item.schedule.find(s=>s.id===(existing?existing.scheduleId:context.id)),amount=wholeAmount(form.get("amount")),verified=form.get("verified")==="on";
      if (!s||amount===null||amount<=0||amount>remaining(item,s)) return fail("Amount must be positive and cannot exceed the instalment balance.");
      if (verified&&!proof) return fail("Enter the NTPN / tax receipt before verification.");
      const payment={id:existing?.id||"receipt-"+Date.now(),scheduleId:s.id,amount,date:submitted,proof,verified};
      if (existing) Object.assign(existing,payment); else item.payments.push(payment);
      log(item,(verified?"Verified ":"Recorded unverified ")+money(amount)+" tax payment. Receipt "+(proof||"pending")+".");
      if (settled(item)&&!executed(item)) log(item,"All tax paid. Required revisions are now visible to supervisor and Tax PIC.");
    } else if (mode==="plan") {
      const p=item.products.find(p=>p.id===form.get("productId")),count=Number(form.get("count"));
      if (!p||p.amount<=0||!Number.isInteger(count)||count<1||count>12||count>p.amount) return fail("Choose a payable byproduct and 1-12 non-zero instalments.");
      const previous=item.schedule.filter(s=>s.productId===p.id);
      if (item.payments.some(r=>previous.some(s=>s.id===r.scheduleId))) return fail("Receipts already exist for this byproduct. Its schedule cannot be replaced.");
      const each=Math.floor(p.amount/count),schedule=Array.from({length:count},(_,i)=>({id:p.id+"-schedule-"+(i+1),productId:p.id,due:nextMonth(submitted,i),amount:i===count-1?p.amount-each*(count-1):each}));
      item.schedule=[...item.schedule.filter(s=>s.productId!==p.id),...schedule]; log(item,count+" internal payment targets recorded for "+p.tax+".");
    } else if (mode==="filing") {
      const p=item.products.find(p=>p.id===context.id);
      if (!settled(item)||!p||!p.revise||p.filing||item.closed) return fail("All payments must be complete before submitting an outstanding required revision.");
      if (!proof) return fail("Enter the filing receipt reference.");
      const latestPaid=item.payments.filter(p=>p.verified).map(p=>p.date).sort().at(-1);
      if (submitted<(latestPaid||resultDoc(item).date)) return fail("Submission date cannot be before the completed payment / result date.");
      p.filing={date:submitted,proof}; log(item,p.tax+" / "+p.period+" revision submitted. Receipt "+proof+".");
    } else if (mode==="final") {
      if (!executed(item)||item.closed) return fail("Settle all payments and submit all required revisions before closing.");
      if (!proof) return fail("Enter the closing document number.");
      const latest=[resultDoc(item).date,...item.payments.filter(p=>p.verified).map(p=>p.date),...revisions(item).map(p=>p.filing.date)].sort().at(-1);
      if (submitted<latest) return fail("Closing document date cannot precede payment or revision completion.");
      const doc={number:proof,date:submitted}; if(item.category==="himbauan") item.sp3=doc; else item.closure=doc;
      item.closed=true; log(item,(item.sp3?"SP3P2DK ":"Closure ")+proof+" registered. Case closed.");
    } else {
      if (!proof) return fail("Enter the SPHP response reference.");
      item.response={date:submitted,proof}; log(item,"SPHP response submitted. Reference "+proof+".");
    }
    $("#entry-dialog").close(); render(); toast("Demo updated. No live records changed.");
  });
  function openReminders() {
    $("#reminder-list").innerHTML=reminders().map(r=>'<div class="reminder-item '+(r.late?"overdue":"")+'"><strong>'+esc(r.item.name)+" / "+esc(r.title)+'</strong>'+esc(r.text)+'<small>Target '+date(r.due)+" / "+(r.late?Math.abs(days(r.due))+" day(s) past target":days(r.due)+" day(s) away")+"</small></div>").join("")||'<p class="muted">No reminders in this sample.</p>';
    $("#reminder-dialog").showModal();
  }
  document.addEventListener("click",event=>{
    const target=event.target instanceof Element?event.target:null;if(!target)return;
    if(target.closest("[data-close-dialog]")){target.closest("dialog").close();return;}
    const tab=target.closest("[data-category]");
    if(tab){category=tab.dataset.category;selected=cases.find(c=>c.category===category).id;detailTab="progress";render();return;}
    const pane=target.closest("[data-detail-tab]");if(pane){detailTab=pane.dataset.detailTab;render();return;}
    const select=target.closest("[data-select]");if(select){selected=selected===select.dataset.select?"":select.dataset.select;detailTab="progress";render();return;}
    const result=target.closest("[data-result]");if(result){selected=result.dataset.result;detailTab="progress";render();openEntry("result");return;}
    const show=target.closest("[data-open-progress]");if(show){selected=show.dataset.openProgress;detailTab="progress";render();return;}
    for(const [attribute,mode] of [["data-payment","payment"],["data-verify","verify"],["data-filing","filing"]]){const button=target.closest("["+attribute+"]");if(button){openEntry(mode,button.getAttribute(attribute));return;}}
    if(target.closest("[data-plan]"))return openEntry("plan");
    if(target.closest("[data-final]"))return openEntry("final");
    if(target.closest("[data-response]"))return openEntry("response");
    if(target.closest("#open-reminders"))openReminders();
  });
  document.addEventListener("change",event=>{
    const input=event.target;
    if(input.matches("[data-task-done]")){
      const item=current(),task=item?.tasks.find(task=>task.id===input.dataset.taskDone);
      if(!task||task.completedAt)return;
      if(input.checked){task.completedAt=AS_OF;render();toast("My Work completed. Case timeline updated automatically.");}
      return;
    }
    if(input.matches("[data-product-choice]")){
      for(const field of input.closest("tr").querySelectorAll('input:not([data-product-choice])'))field.disabled=!input.checked;
    }
    if(input.matches("[data-cell]")){
      const item=cases.find(c=>c.id===input.dataset.case),key=input.dataset.cell;let value=input.value.trim();
      if(["letterDate","received"].includes(key)){
        const match=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/),iso=match?match[3]+"-"+match[2].padStart(2,"0")+"-"+match[1].padStart(2,"0"):value;
        if(!validDate(iso)){input.value=date(item[key]);return toast("Use a valid dd/mm/yyyy date.");}value=iso;
      }
      if(value!==item[key]){item[key]=value;log(item,"Register field updated: "+key+".",item.acc+" / ACC");}
      input.value=["letterDate","received"].includes(key)?date(value):value;
    }
  });
  document.addEventListener("submit",event=>{
    if(event.target.id==="linked-task-form"){
      event.preventDefault();const form=new FormData(event.target),item=current(),title=String(form.get("taskTitle")||"").trim();
      if(!item||item.closed||!title)return;
      const team=form.get("taskTeam")==="Tax"?"Tax":"ACC";
      item.tasks.push({id:"TASK-DEMO-"+String(++taskSequence).padStart(3,"0"),title:title.slice(0,200),actor:(team==="Tax"?item.tax:item.acc)+" / "+team,completedAt:null});
      render();$(".linked-work").open=true;toast("Demo My Work task linked. It will enter the timeline when completed.");return;
    }
    if(event.target.id!=="followup-form")return;
    event.preventDefault();const form=new FormData(event.target),text=String(form.get("entry")||"").trim(),item=current();if(!text||!item)return;
    const team=form.get("team");log(item,text.slice(0,1000),(team==="ACC"?item.acc:item.tax)+" / "+team);render();toast("Progress added to demo timeline.");
  });
  for(const dialog of document.querySelectorAll("dialog"))dialog.addEventListener("click",event=>{
    if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
  });
  $("#search").addEventListener("input",render);
  for(const [selector,key] of [["#acc-filter","acc"],["#tax-filter","tax"]]){
    $(selector).insertAdjacentHTML("beforeend",[...new Set(cases.map(c=>c[key]))].sort().map(name=>"<option>"+esc(name)+"</option>").join(""));
    $(selector).addEventListener("change",render);
  }
  $("#attention-filter").addEventListener("change",render);
  $("#reset-filters").addEventListener("click",()=>{$("#search").value="";for(const key of ["#acc-filter","#tax-filter","#attention-filter"])$(key).value="";render();});
  $("#reset-demo").addEventListener("click",()=>{cases=seeds();category="himbauan";selected=cases[0].id;detailTab="progress";$("#reset-filters").click();toast("Sample data reset.");});
  render();
})();
