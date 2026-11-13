/* Pending edits stay in memory; only the reviewed server transaction changes clients. */
(() => {
  'use strict';
  let host, account='', generation=0, records=[], fields=[], loaded=false, loading=false, busy=false, error='', notice='', review=null;
  let group='details', search='', status='Active', category='all', tax='all', acc='all', page=0, sort='client_code', direction=1;
  const drafts=new Map(), selected=new Set(), pageSize=100;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={contract:'Contract',on_demand:'On Demand',free_of_charge:'Free of Charge'};
  const field=key=>fields.find(item=>item.key===key);
  const same=(a,b)=>String(a??'')===String(b??'');
  const current=(row,key)=>drafts.get(row.id)?.[key]??row[key];
  const visible=()=>records.filter(row=>(status==='all'||row.status===status)&&(category==='all'||(row.engagement_type||'contract')===category)&&(tax==='all'||(row.tax_pic_name||'')===tax)&&(acc==='all'||(row.accounting_pic_name||'')===acc)&&(!search||[row.client_code,current(row,'legal_name'),row.npwp,row.tax_pic_name,row.accounting_pic_name].join(' ').toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>String(current(a,sort)||'').localeCompare(String(current(b,sort)||''),undefined,{numeric:true,sensitivity:'base'})*direction||a.id.localeCompare(b.id));
  const display=(key,value)=>field(key)?.type==='boolean'?(value?'Yes':'No'):field(key)?.type==='amount'?Number(value||0).toLocaleString('id-ID'):field(key)?.type==='date'&&/^\d{4}-\d{2}-\d{2}/.test(String(value))?String(value).slice(0,10).split('-').reverse().join('/'):String(value??'');
  function stage(id,key,value){
    const row=records.find(row=>row.id===id);if(!row)return;
    const patch={...(drafts.get(id)||{})};
    if(same(value,row[key]))delete patch[key];else patch[key]=value;
    if(Object.keys(patch).length)drafts.set(id,patch);else drafts.delete(id);
    review=null;error='';notice='';
  }
  function updateStatus(){
    if(!host?.root?.isConnected)return;
    const root=host.root;
    root.querySelector('[data-cb-count]').textContent=`${selected.size} selected / ${drafts.size} client(s) with pending edits${notice?' / '+notice:''}`;
    root.querySelector('[data-cb-review]').disabled=busy||loading||!drafts.size;
    root.querySelector('[data-cb-reset]').disabled=busy||loading||!drafts.size;
    const apply=root.querySelector('[data-cb-apply]');if(apply)apply.disabled=busy||!selected.size;
    root.querySelectorAll('[data-cb-select]').forEach(input=>{input.checked=selected.has(input.dataset.cbSelect);});
    const boxes=[...root.querySelectorAll('[data-cb-select]')],all=root.querySelector('[data-cb-select-page]');
    if(all){all.checked=!!boxes.length&&boxes.every(box=>box.checked);all.indeterminate=boxes.some(box=>box.checked)&&!all.checked;}
    root.querySelectorAll('[data-cb-cell]').forEach(input=>input.closest('td').classList.toggle('cb-dirty',Object.hasOwn(drafts.get(input.dataset.cbId)||{},input.dataset.cbCell)));
  }
  function input(row,item){
    const value=current(row,item.key),attrs=`data-cb-cell="${item.key}" data-cb-id="${esc(row.id)}" aria-label="${esc(item.label)}: ${esc(row.client_code)}" ${busy?'disabled':''}`;
    if(item.type==='boolean')return `<input type="checkbox" ${attrs} ${value?'checked':''}>`;
    if(item.options)return `<select ${attrs}>${[...new Set([...item.options,...(value?[String(value)]:[])])].map(option=>`<option ${String(value||'')===option?'selected':''}>${esc(option)}</option>`).join('')}</select>`;
    return `<input ${attrs} value="${esc(display(item.key,value))}" ${item.type==='amount'?'inputmode="numeric"':''} ${item.type==='date'?'placeholder="dd/mm/yyyy"':''} ${item.max?`maxlength="${item.max}"`:''}>`;
  }
  function toolbarFilter(key,value,options,label){return `<select data-cb-filter="${key}" aria-label="${label}" ${busy?'disabled':''}>${options.map(([v,l])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(l)}</option>`).join('')}</select>`;}
  function render(){
    if(!host?.root?.isConnected)return;
    const root=host.root;
    if(!host.canEdit||host.offline){root.innerHTML=`<div class="panel"><p>${host.offline?'Bulk Edit requires the live database; no demo changes will be saved.':'Leadership access is required for Bulk Edit.'}</p></div>`;return;}
    if(!loaded){root.innerHTML=`<div class="panel">${notice?`<p role="status">${esc(notice)}</p>`:''}<p role="status">${esc(error||'Loading saved client data...')}</p>${error?'<button data-cb-load>Retry</button>':''}</div>`;return;}
    const rows=visible(),pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages-1);
    const shown=rows.slice(page*pageSize,(page+1)*pageSize),columns=fields.filter(item=>item.group===group),applyFields=columns.filter(item=>!['legal_name','npwp'].includes(item.key));
    root.innerHTML=`<section class="panel cb-panel" aria-busy="${loading||busy}"><div class="cb-underlay" ${review||loading?'inert':''}><div class="cb-heading"><div><h3>Bulk Edit</h3><p class="subline">Edit cells or apply one value to selected clients. Nothing saves until Review Changes and Save Changes.</p></div><div class="workspace-tabs submenu-secondary">${[['details','Details'],['commercial','Fees & Dates'],['obligations','Obligations']].map(([key,label])=>`<button class="${group===key?'solid-btn':'ghost-btn'}" data-cb-group="${key}" ${busy?'disabled':''}>${label}</button>`).join('')}</div></div>
      <div class="cb-tools"><input data-cb-search type="search" value="${esc(search)}" placeholder="Search client, code, PIC (Enter)..." aria-label="Search bulk clients" ${busy?'disabled':''}>
      ${toolbarFilter('status',status,[['Active','Active clients'],['Inactive','Inactive clients'],['all','All statuses']],'Client status')}
      ${toolbarFilter('category',category,[['all','All categories'],...Object.entries(labels)],'Client category')}
      ${toolbarFilter('tax',tax,[['all','All Tax PIC'],...new Set(records.map(row=>row.tax_pic_name||'')).values()].map(value=>Array.isArray(value)?value:[value,value||'No Tax PIC']),'Tax PIC')}
      ${toolbarFilter('acc',acc,[['all','All ACC PIC'],...new Set(records.map(row=>row.accounting_pic_name||'')).values()].map(value=>Array.isArray(value)?value:[value,value||'No ACC PIC']),'ACC PIC')}
      <button class="ghost-btn" data-cb-clear-filters ${busy?'disabled':''}>Reset filters</button></div>
      <div class="cb-apply"><strong>Apply to selected</strong><select data-cb-field aria-label="Bulk field" ${busy?'disabled':''}>${applyFields.map(item=>`<option value="${item.key}">${esc(item.label)}</option>`).join('')}</select><span data-cb-value-slot></span><button class="ghost-btn" data-cb-apply ${busy||!selected.size?'disabled':''}>Apply value</button><span class="subline">Stages edits only</span></div>
      <p class="subline cb-note">PIC changes stay in Allocation. Use existing client actions for status/category changes. Dates: dd/mm/yyyy. Fees: whole rupiah, excluding tax. Blank cells clear optional fields.</p>
      <div class="cb-table-wrap" tabindex="0" aria-label="Client bulk editing sheet"><table class="cb-table"><thead><tr><th><input type="checkbox" data-cb-select-page aria-label="Select this page" ${shown.length&&shown.every(row=>selected.has(row.id))?'checked':''} ${busy?'disabled':''}></th><th>No.</th><th><button data-cb-sort="client_code">Code ${sort==='client_code'?(direction===1?'&#8593;':'&#8595;'):''}</button></th>${columns.map(item=>`<th>${['legal_name','company_form'].includes(item.key)?`<button data-cb-sort="${item.key}">${esc(item.label)} ${sort===item.key?(direction===1?'&#8593;':'&#8595;'):''}</button>`:esc(item.label)}</th>`).join('')}<th>Status / category</th><th>Tax PIC / ACC PIC</th></tr></thead><tbody>${shown.map((row,i)=>`<tr><td><input type="checkbox" data-cb-select="${esc(row.id)}" aria-label="Select ${esc(row.client_code)}" ${selected.has(row.id)?'checked':''} ${busy?'disabled':''}></td><td>${page*pageSize+i+1}</td><td>${esc(row.client_code)}${group!=='details'?`<small>${esc(current(row,'legal_name'))}</small>`:''}</td>${columns.map(item=>`<td class="${Object.hasOwn(drafts.get(row.id)||{},item.key)?'cb-dirty':''}">${input(row,item)}</td>`).join('')}<td>${esc(row.status)}<small>${esc(labels[row.engagement_type]||'Contract')}</small></td><td>${esc(row.tax_pic_name||'No Tax PIC')}<small>${esc(row.accounting_pic_name||'No ACC PIC')}</small></td></tr>`).join('')||`<tr><td colspan="${columns.length+5}">No clients match these filters.</td></tr>`}</tbody></table></div>
      <footer class="cb-footer"><span data-cb-count role="status"></span><span>${rows.length} filtered / Page ${page+1} of ${pages}</span><button class="ghost-btn" data-cb-page="-1" ${busy||!page?'disabled':''}>Previous</button><button class="ghost-btn" data-cb-page="1" ${busy||page>=pages-1?'disabled':''}>Next</button><button class="ghost-btn" data-cb-reset ${busy||!drafts.size?'disabled':''}>Discard & reload</button><button class="solid-btn" data-cb-review ${busy||!drafts.size?'disabled':''}>${busy?'Checking...':'Review Changes'}</button></footer>
      ${error?`<p role="alert" class="cb-error">${esc(error)}</p>`:''}</div></section>
      ${review?`<div class="client-editor-backdrop"><section class="client-editor-modal import-preview-modal" role="dialog" aria-modal="true" aria-label="Review client bulk changes"><div class="client-editor-head"><div><h3>Review ${review.rows.length} client(s)</h3><p class="subline">Save all changes together. IDs, PIC assignments, engagement categories and existing history stay intact.</p></div><button class="ghost-btn" data-cb-cancel-review ${busy?'disabled':''}>Close</button></div><div class="import-preview-table"><table><thead><tr><th>Client</th><th>Field</th><th>Saved value</th><th>New value</th></tr></thead><tbody>${review.rows.flatMap(row=>row.fields.map(item=>`<tr><td>${esc(row.clientCode)} / ${esc(row.name)}</td><td>${esc(item.label)}</td><td>${esc(display(item.key,item.before))||'Empty'}</td><td>${esc(display(item.key,item.after))||'Empty'}</td></tr>`)).join('')}</tbody></table></div>${error?`<p class="cb-error" role="alert">${esc(error)}</p>`:''}<div class="client-editor-actions"><button class="ghost-btn" data-cb-cancel-review ${busy?'disabled':''}>Back to editing</button><button class="solid-btn" data-cb-save ${busy?'disabled':''}>${busy?'Saving...':'Save Changes'}</button></div></section></div>`:''}`;
    const initial=applyFields[0];if(initial)renderApplyInput(initial);
    updateStatus();
  }
  function renderApplyInput(item){
    const slot=host.root.querySelector('[data-cb-value-slot]');if(!slot)return;
    slot.innerHTML=item.type==='boolean'?'<select data-cb-value aria-label="Value for selected clients"><option value="true">Yes / checked</option><option value="false">No / unchecked</option></select>':item.options?`<select data-cb-value aria-label="Value for selected clients">${item.options.map(value=>`<option>${esc(value)}</option>`).join('')}</select>`:`<input data-cb-value aria-label="Value for selected clients" placeholder="${item.type==='date'?'dd/mm/yyyy':item.type==='amount'?'Whole rupiah':'Value (blank clears)'}">`;
  }
  async function load(){
    if(loading||!host?.canEdit||host.offline)return;
    const epoch=generation,source=host;
    loading=true;error='';render();
    try{const response=await source.fetch('/api/clients/bulk-edit',{cache:'no-store'});const result=await response.json();if(epoch!==generation)return;if(!response.ok)throw Error(result.error||'Clients could not be loaded.');records=result.data||[];fields=result.fields||[];loaded=true;}
    catch(e){if(epoch===generation)error=e.message||'Clients could not be loaded.';}finally{if(epoch===generation){loading=false;render();}}
  }
  const payload=()=>[...drafts].map(([id,changes])=>({id,expectedUpdatedAt:records.find(row=>row.id===id).updated_at,changes:{...changes}}));
  async function request(operation){
    if(busy||!drafts.size)return;
    const submitted=operation==='save'?review?.payload:payload();if(!submitted)return;
    const epoch=generation,source=host;
    busy=true;error='';render();
    try{
      const response=await source.fetch('/api/clients/bulk-edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,clients:submitted,...(operation==='save'?{expectedMatches:review.matches}:{})})});
      const result=await response.json();if(epoch!==generation)return;if(!response.ok)throw Error(result.error||'Changes could not be saved.');
      if(operation==='review')review={payload:submitted,rows:result.review,matches:result.expectedMatches};
      else {if(result.updated!==submitted.length)throw Error('The save result could not be confirmed. Your edits are kept; reload saved data before retrying.');notice=`Saved ${result.updated} client(s) to the database.`;drafts.clear();selected.clear();review=null;loaded=false;await load();if(epoch===generation)await source.onSaved?.();}
    }catch(e){if(epoch===generation)error=e.message||'Changes could not be saved.';}finally{if(epoch===generation){busy=false;render();}}
  }
  function bind(root){
    root.addEventListener('input',event=>{const input=event.target;if(busy||loading||review||!input.matches('[data-cb-cell]')||input.type==='checkbox')return;stage(input.dataset.cbId,input.dataset.cbCell,input.value);updateStatus();});
    root.addEventListener('focusout',event=>{const input=event.target;if(!input.matches('[data-cb-cell]')||busy||review)return;const item=field(input.dataset.cbCell);if(item.type==='amount'&&/^\d{1,3}(?:\.\d{3})*$|^\d+$/.test(input.value)){const number=Number(input.value.replaceAll('.',''));stage(input.dataset.cbId,item.key,number);input.value=display(item.key,number);updateStatus();}});
    root.addEventListener('change',event=>{
      const input=event.target;if(busy||loading||review)return;
      if(input.matches('[data-cb-cell]')){stage(input.dataset.cbId,input.dataset.cbCell,input.type==='checkbox'?input.checked:input.value);updateStatus();}
      if(input.matches('[data-cb-select]')){input.checked?selected.add(input.dataset.cbSelect):selected.delete(input.dataset.cbSelect);updateStatus();}
      if(input.matches('[data-cb-select-page]')){root.querySelectorAll('[data-cb-select]').forEach(box=>input.checked?selected.add(box.dataset.cbSelect):selected.delete(box.dataset.cbSelect));updateStatus();}
      if(input.matches('[data-cb-field]'))renderApplyInput(field(input.value));
      if(input.matches('[data-cb-filter]')){({status:v=>status=v,category:v=>category=v,tax:v=>tax=v,acc:v=>acc=v})[input.dataset.cbFilter](input.value);page=0;selected.clear();render();}
      if(input.matches('[data-cb-search]')){search=input.value;page=0;selected.clear();render();}
    });
    root.addEventListener('keydown',event=>{if(event.target.matches('[data-cb-search]')&&event.key==='Enter'){event.preventDefault();search=event.target.value;page=0;selected.clear();render();}if(event.key==='Escape'&&review&&!busy){review=null;render();}});
    root.addEventListener('click',async event=>{
      const target=event.target.closest('button');if(!target||busy||loading)return;
      if(review&&!target.matches('[data-cb-save],[data-cb-cancel-review]'))return;
      if(target.hasAttribute('data-cb-group')){group=target.dataset.cbGroup;render();}
      if(target.hasAttribute('data-cb-clear-filters')){search='';status='Active';category=tax=acc='all';page=0;selected.clear();render();}
      if(target.hasAttribute('data-cb-sort')){direction=sort===target.dataset.cbSort?-direction:1;sort=target.dataset.cbSort;render();}
      if(target.hasAttribute('data-cb-page')){page+=Number(target.dataset.cbPage);render();}
      if(target.hasAttribute('data-cb-apply')){if(selected.size>500){error='Select at most 500 clients per batch.';render();return;}const key=root.querySelector('[data-cb-field]').value,item=field(key),raw=root.querySelector('[data-cb-value]').value;for(const id of selected)stage(id,key,item.type==='boolean'?raw==='true':raw);render();}
      if(target.hasAttribute('data-cb-reset')&&window.confirm('Discard all unsaved Bulk Edit changes and reload saved client data?')){drafts.clear();selected.clear();review=null;loaded=false;await load();}
      if(target.hasAttribute('data-cb-load'))await load();
      if(target.hasAttribute('data-cb-review'))await request('review');
      if(target.hasAttribute('data-cb-save'))await request('save');
      if(target.hasAttribute('data-cb-cancel-review')){review=null;error='';render();}
    });
  }
  window.addEventListener('beforeunload',event=>{if(drafts.size||busy){event.preventDefault();event.returnValue='';}});
  window.ClientBulkEdit={mount(root,options){
    if(account!==options.account){generation++;account=options.account;records=[];fields=[];drafts.clear();selected.clear();loaded=false;loading=busy=false;review=null;error=notice='';}
    host={root,...options};bind(root);render();if(!loaded||!drafts.size&&!busy)void load();
  }};
})();
