/* Selection changes engagement only; PICs and completed work remain intact. */
(() => {
  const selected = new Set(); let context, busy = false, destination='on_demand',previousTab='';
  const labels={contract:'Contract Clients',free_of_charge:'Free of Charge Clients',on_demand:'On Demand Clients'};
  const type = row => ['on_demand','free_of_charge'].includes(row.engagementType) ? row.engagementType : 'contract';
  function enhance(options) {
    context=options;const root=document.getElementById('client-management-view');
    if(!root||!['active','on-demand','free-of-charge'].includes(options.tab)){selected.clear();previousTab='';return;}
    if(previousTab!==options.tab){destination=options.tab==='active'?'on_demand':'contract';selected.clear();previousTab=options.tab;}
    const ids=new Set(options.rows.map(row=>row.id));for(const id of selected)if(!ids.has(id))selected.delete(id);
    const table=root.querySelector('.client-table');if(!table||!options.canManage)return;
    const checkbox=(id,all=false)=>{const el=document.createElement('input');el.type='checkbox';el.disabled=busy;el.setAttribute(all?'data-client-select-all':'data-client-select',id);el.setAttribute('aria-label',all?'Select all filtered clients':'Select client');el.checked=all?!!options.rows.length&&options.rows.every(row=>selected.has(row.id)):selected.has(id);el.indeterminate=all&&selected.size>0&&!el.checked;el.className='client-selection-check';return el;};
    table.querySelector('thead th').prepend(checkbox('',true));
    table.querySelectorAll('tr[data-client-master-toggle]').forEach(row=>row.querySelector('td')?.prepend(checkbox(row.dataset.clientMasterToggle)));
    root.querySelectorAll('.client-mobile-row[data-client-master-toggle]').forEach(row=>row.querySelector('.client-mobile-name')?.prepend(checkbox(row.dataset.clientMasterToggle)));
    const bar=document.createElement('div');bar.className='client-engagement-actions';
    const all=document.createElement('label');all.append(checkbox('',true),document.createTextNode('Select filtered clients'));bar.append(all);
    const count=document.createElement('span');count.textContent=`${selected.size} selected`;bar.append(count);
    const target=document.createElement('select');target.className='filter-select';target.setAttribute('data-client-engagement-target','');target.setAttribute('aria-label','Move selected clients to');target.disabled=busy;
    const currentType=options.tab==='on-demand'?'on_demand':options.tab==='free-of-charge'?'free_of_charge':'contract';
    for(const [value,label]of Object.entries(labels)){if(value===currentType)continue;const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=value===destination;target.append(option);}bar.append(target);
    const button=document.createElement('button');button.className='solid-btn';button.setAttribute('data-move-client-engagement','');button.disabled=busy||!selected.size;button.textContent=busy?'Moving...':'Move selected';bar.append(button);
    const note=document.createElement('span');note.className='subline';note.textContent='PICs, contract dates and completed work are retained.';bar.append(note);table.closest('.table-wrap').before(bar);
  }
  document.addEventListener('click',event=>{if(event.target.matches?.('[data-client-select],[data-client-select-all]'))event.stopImmediatePropagation();},true);
  document.addEventListener('change',event=>{
    const el=event.target;if(!context?.canManage||busy)return;
    if(el.matches('[data-client-engagement-target]')){destination=el.value;return;}
    if(el.matches('[data-client-select]')){el.checked?selected.add(el.dataset.clientSelect):selected.delete(el.dataset.clientSelect);context.render();}
    if(el.matches('[data-client-select-all]')){selected.clear();if(el.checked)context.rows.forEach(row=>selected.add(row.id));context.render();}
  });
  document.addEventListener('click',async event=>{
    if(!event.target.closest('[data-move-client-engagement]')||!context?.canManage||busy||!selected.size)return;
    const current=context,rows=current.rows.filter(row=>selected.has(row.id)),target=destination;
    if(!window.confirm(`Move ${rows.length} selected client(s) to ${labels[target]}? ${target==='on_demand'?'They will not be generated automatically for monthly compliance.':target==='free_of_charge'?'They remain eligible for monthly compliance, but are excluded from the paid Active Clients portfolio.':'They will be eligible for monthly compliance according to their obligations.'} Existing fees, dates, work and PIC history will not change.`))return;
    busy=true;current.render();
    try{
      if(!current.offline){const response=await current.fetch('/api/clients/engagement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engagementType:target,clients:rows.map(row=>({id:row.databaseId,beforeType:type(row)}))})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Clients could not be moved.');if(result.updated!==rows.length)throw new Error('Refresh Client Master to confirm the saved engagement types.');}
      rows.forEach(row=>{row.engagementType=target;});selected.clear();current.moved(target);
    }catch(error){window.alert(error.message);}finally{busy=false;current.render();}
  });
  window.ClientEngagement={enhance};
})();
