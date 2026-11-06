(() => {
  "use strict";
  const groups=[{key:"progress",label:"In progress"},{key:"payment",label:"Payment / Instalments"},{key:"revision",label:"Revision"},{key:"done",label:"Done"}];
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const date=value=>/^\d{4}-\d{2}-\d{2}/.test(String(value||""))?String(value).slice(0,10).split("-").reverse().join("/"):"-";
  const money=value=>value===null?"-":"Rp"+Number(value).toLocaleString("id-ID");
  const timestamp=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Makassar",dateStyle:"short",timeStyle:"short"})+" WITA":"Date not recorded";
  function build(records,options){
    const seen=new Set(),counts={handled:0,progress:0,payment:0,revision:0,done:0};
    const rows=[];
    for(const item of records){
      if(!item.id||seen.has(item.id)||item.deletedAt||(!options.offline&&item.id.startsWith("case-"))||!item.clientName)continue;
      seen.add(item.id);
      const bucket=window.CaseWorkflowUI.bucket(item),w=item.workflow,s=w?.result?window.CaseWorkflowUI.status(w):null;
      const nextPayment=w?.schedule?.filter(row=>row.amount>w.payments.filter(p=>p.verified&&p.scheduleId===row.id).reduce((sum,p)=>sum+p.amount,0)).map(row=>row.due).sort()[0]||"";
      counts.handled++;counts[bucket]++;
      rows.push({id:item.id,version:item.version||"",latestProgress:null,lastUpdate:null,number:options.numberFor?.(item.id)??rows.length+1,client:item.clientName,letter:item.letterNumber||"-",taxPic:item.taxPic||"Unassigned",accPic:item.accountingPic||"Unassigned",bucket,status:bucket==="done"?"Done":window.CaseWorkflowUI.summary(item),target:bucket==="done"?"":bucket==="payment"?nextPayment:bucket==="revision"?w.revisionTarget:item.dueDate||"",balance:s?s.total-s.paid:null});
    }
    return {category:options.category||"Cases",filters:[...(options.filters||[])],offline:Boolean(options.offline),generatedAt:options.now||new Date().toISOString(),counts,rows};
  }
  function renderSummary(snapshot,busy=false){
    const metrics=[{key:"handled",label:"Handled"},...groups];
    return `<section class="case-report-summary" aria-label="${esc(snapshot.category)} case summary"><div class="case-report-summary-head"><span>Case summary <strong>${esc(snapshot.category)}</strong></span><button type="button" class="ghost-btn" data-case-print-report ${busy||!snapshot.rows.length?"disabled":""}><svg class="case-tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6zM17 12h1"/></svg>Print Report</button></div><div class="case-report-metrics">${metrics.map(metric=>`<div class="case-report-metric" data-case-report-metric="${metric.key}"><strong>${snapshot.counts[metric.key]}</strong><span>${metric.label}</span></div>`).join("")}</div></section>`;
  }
  function withProgress(snapshot,data){
    const rows=snapshot.rows.map(row=>{
      if(!Object.hasOwn(data.latestById||{},row.id)||!Object.hasOwn(data.versionsById||{},row.id)||!Object.hasOwn(data.lastUpdateById||{},row.id))throw Error("Latest progress is incomplete. Please retry printing.");
      if(row.version && row.version!==data.versionsById[row.id])throw Error("Cases changed since the list was loaded. Refresh the case list before printing.");
      return {...row,latestProgress:data.latestById[row.id],lastUpdate:data.lastUpdateById[row.id]};
    });
    return {...snapshot,rows,generatedAt:new Date().toISOString()};
  }
  function progressCell(row){
    const progress=row.latestProgress,last=row.lastUpdate;
    let html=progress?`<div>${esc(progress.entry)}</div>`:'<span class="progress-empty">No progress recorded.</span>';
    if(progress && (!last||timestamp(last.createdAt)!==timestamp(progress.createdAt)||last.creatorName!==progress.creatorName))html+=`<small>Progress: ${esc(timestamp(progress.createdAt))} / ${esc(progress.creatorName||"Unknown PIC")}</small>`;
    if(last)html+=`<small>Last update: ${esc(timestamp(last.createdAt))} / ${esc(last.creatorName||"Unknown PIC")}</small>`;
    return html;
  }
  function buildHtml(snapshot){
    const generated=new Date(snapshot.generatedAt).toLocaleString("en-GB",{timeZone:"Asia/Makassar",dateStyle:"medium",timeStyle:"short"});
    const filters=snapshot.filters.length?snapshot.filters.join(" / "):"All PICs / No additional filters";
    const metrics=[{key:"handled",label:"Handled"},...groups];
    const sections=groups.map(group=>{
      const rows=snapshot.rows.filter(row=>row.bucket===group.key);if(!rows.length)return "";
      return `<tbody><tr class="group"><th colspan="9">${group.label} (${rows.length})</th></tr>${rows.map(row=>`<tr><td>${esc(row.number)}</td><td>${esc(row.client)}</td><td>${esc(row.letter)}</td><td>${esc(row.taxPic)}</td><td>${esc(row.accPic)}</td><td>${esc(row.status)}</td><td>${date(row.target)}</td><td class="amount">${money(row.balance)}</td><td class="progress">${progressCell(row)}</td></tr>`).join("")}</tbody>`;
    }).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(snapshot.category)} Case Report</title><style>
      @page {size:A4 landscape;margin:12mm;} *{box-sizing:border-box;}body{font-family:"Segoe UI",Tahoma,sans-serif;color:#20343c;margin:24px;font-size:11px;}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #147d82;padding-bottom:10px;}h1{font-size:22px;margin:4px 0;}p{margin:5px 0;line-height:1.5;overflow-wrap:anywhere;}.brand{font-size:10px;letter-spacing:2px;} .meta{max-width:50%;text-align:right;color:#526770;}.metrics{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #cdd8d6;margin:16px 0;}.metric{padding:10px 12px;border-right:1px solid #cdd8d6;}.metric:last-child{border:0;}.metric strong{display:block;font-size:24px;}.metric span{font-size:11px;}.note{font-size:10px;color:#526770;margin-bottom:10px;}table{width:100%;border-collapse:collapse;table-layout:fixed;}col:nth-child(1){width:4%;}col:nth-child(2){width:17%;}col:nth-child(3){width:12%;}col:nth-child(4),col:nth-child(5){width:8%;}col:nth-child(6){width:12%;}col:nth-child(7){width:9%;}col:nth-child(8){width:10%;}col:nth-child(9){width:20%;}th,td{border:1px solid #cdd8d6;padding:7px;text-align:left;overflow-wrap:anywhere;vertical-align:top;}thead th{background:#eaf1ed;font-size:10px;}thead{display:table-header-group;}tr{break-inside:avoid;page-break-inside:avoid;}.group th{padding:9px 7px 6px;background:#f2f6f3;break-after:avoid;page-break-after:avoid;}.progress{line-height:1.45;}.progress small{display:block;margin-top:5px;font-size:9px;color:#526770;}.progress-empty{color:#526770;}.amount{text-align:right;font-variant-numeric:tabular-nums;}footer{margin-top:14px;font-size:9px;color:#526770;}@media print{body{margin:0;}header,.metrics{break-inside:avoid;} }
      </style></head><body><header><div><div class="brand">LMATS CONSULTING</div><h1>Case Report</h1><p>${esc(snapshot.category)}</p></div><div class="meta"><p>Generated ${esc(generated)} WITA</p><p>${esc(filters)}</p>${snapshot.offline?"<p>Sample data / Offline preview</p>":""}</div></header><section class="metrics">${metrics.map(metric=>`<div class="metric"><strong>${snapshot.counts[metric.key]}</strong><span>${metric.label}</span></div>`).join("")}</section><p class="note">In progress includes cases awaiting final closure. Payment and revision targets are internal. Unpaid amounts exclude unverified receipts.</p><table><colgroup>${"<col>".repeat(9)}</colgroup><thead><tr><th>No.</th><th>Client</th><th>Letter no.</th><th>Tax PIC</th><th>ACC PIC</th><th>Status</th><th>Due / target</th><th>Unpaid</th><th>Latest Progress / Last Update</th></tr></thead>${sections||'<tbody><tr><td colspan="9">No saved cases match these filters.</td></tr></tbody>'}</table><footer>Current saved records at report generation. Archived cases and unsaved drafts are excluded. This report is not a finalized monthly snapshot.</footer></body></html>`;
  }
  function open(){
    const popup=window.open("","_blank","width=1180,height=800");if(!popup)return false;
    popup.opener=null;
    popup.document.open();popup.document.write('<!doctype html><title>Preparing Case Report</title><p role="status" style="font-family:Segoe UI,sans-serif;padding:24px">Loading latest progress...</p>');popup.document.close();
    return popup;
  }
  function print(snapshot,reservedPopup){
    const popup=reservedPopup||open();if(!popup||popup.closed)return false;
    popup.document.open();popup.document.write(buildHtml(snapshot));popup.document.close();
    popup.focus();popup.print();return true;
  }
  window.CaseReports={build,renderSummary,buildHtml,withProgress,open,print};
})();
