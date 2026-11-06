/* Menu presentation only. Every database operation remains server-authorized. */
(() => {
  "use strict";
  const features = [["operations","Operations"],["cases","Cases"],["myWork","My Work"],["clients","Clients"],["management","Management"],["allocation","Allocation"],["notifications","Notifications"],["profile","Profile"]];
  const views = {"matrix-view":"operations","cases-view":"cases","my-work-view":"myWork","client-view":"clients","client-management-view":"clients","dashboard-view":"management","allocation-view":"allocation","announcement-view":"notifications","profile-view":"profile"};
  const modes = [["hidden","Hidden"],["enabled","Available"],["preview","Available + notice"],["maintenance","Maintenance / blocked"]];
  let settings, draft, draftVersion = 0, role = "staff", offline = false, saving = false, dirty = false, error = "", context;
  const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const manager = () => ["supervisor","partner","admin"].includes(role);
  function defaults(){const rules=()=>Object.fromEntries(features.map(([id])=>[id,{mode:["operations","management","allocation"].includes(id)?"hidden":"enabled",message:""}]));return {associate:rules(),leader:rules()};}
  function accept(value, nextRole){
    role = String(nextRole || role).toLowerCase();
    settings = value?.policy ? structuredClone(value) : {policy:defaults(),version:0,ready:false};
    if (!dirty) { draft = structuredClone(settings.policy); draftVersion = settings.version; }
  }
  function rule(feature){return manager() || offline ? {mode:"enabled",message:""} : settings.policy[role==="leader"?"leader":"associate"][feature] || {mode:"hidden",message:""};}
  const can = feature => ["enabled","preview"].includes(rule(feature).mode);
  const visible = feature => rule(feature).mode !== "hidden";
  function normalize(view){return visible(views[view]||"profile") ? view : ["my-work-view","cases-view","client-management-view","profile-view"].find(id=>can(views[id]));}
  function editor(){
    if (!manager()) return "";
    return `<section class="panel feature-access-editor"><div class="section-title"><div><h3>Feature access &amp; notices</h3><p>Associate = Staff accounts. Leader = Leader accounts. Supervisors and Partners retain all menus and exclusive PIC Access controls.</p></div><button class="ghost-btn" data-feature-reload ${saving?"disabled":""}>Reload saved</button></div><div class="feature-access-help">Hidden removes the menu. Available + notice keeps it usable with your message. Maintenance shows the menu but blocks its data and actions. Menu access never grants additional PIC ownership or editing rights. Profile stays available.</div>${!settings.ready&&!offline?'<p class="feature-access-error">Apply the feature-access database migration before saving these settings.</p>':""}<div class="table-wrap"><table><thead><tr><th rowspan="2">Menu</th><th colspan="2">Associate</th><th colspan="2">Leader</th></tr><tr><th>Access</th><th>Notice shown on opening</th><th>Access</th><th>Notice shown on opening</th></tr></thead><tbody>${features.map(([id,label])=>`<tr><th scope="row">${label}</th>${["associate","leader"].map(tier=>`<td><select class="field" data-feature-mode="${id}" data-feature-tier="${tier}" aria-label="${tier} ${label} access" ${id==="profile"||saving?"disabled":""}>${modes.map(([value,name])=>`<option value="${value}" ${draft[tier][id].mode===value?"selected":""}>${name}</option>`).join("")}</select></td><td><input class="field" data-feature-message="${id}" data-feature-tier="${tier}" maxlength="400" aria-label="${tier} ${label} notice" value="${esc(draft[tier][id].message)}" placeholder="Example: In progress. Please report any issues." ${id==="profile"||saving?"disabled":""}></td>`).join("")}</tr>`).join("")}</tbody></table></div><div class="feature-access-footer"><span data-feature-save-status role="status">${esc(error || (dirty?"Unsaved access settings":`Saved settings / version ${settings.version}`))}</span><button class="solid-btn" data-feature-save ${saving||!dirty||!settings.ready&&!offline?"disabled":""}>${saving?"Saving...":"Save feature access"}</button></div></section>`;
  }
  function chrome(view){
    document.querySelectorAll(".nav-btn[data-view]").forEach(b=>{const f=views[b.dataset.view];if(f)b.hidden=!visible(f);});
    document.querySelectorAll("[data-open-announcement-inbox]").forEach(b=>b.hidden=!visible("notifications"));
    document.querySelectorAll('[data-management-tab="workload"]').forEach(b=>b.hidden=!manager());
    const root=document.getElementById("feature-notice-root"),f=views[view];
    if(root)root.innerHTML=f&&rule(f).mode==="preview"?`<div class="feature-notice" role="status"><strong>In progress</strong><span>${esc(rule(f).message)}</span></div>`:"";
  }
  function blocked(view){
    const f=views[view];if(!f||can(f))return false;
    const root=document.getElementById(view);if(root)root.innerHTML=`<section class="panel feature-blocked"><h3>${esc(features.find(([id])=>id===f)?.[1])} is temporarily unavailable</h3><p>${esc(rule(f).message || "This feature has not been enabled for your access level.")}</p></section>`;
    return true;
  }
  function updateStatus(){const node=document.querySelector('[data-feature-save-status]');if(node)node.textContent=error || (dirty?"Unsaved access settings":`Saved settings / version ${settings.version}`);const save=document.querySelector('[data-feature-save]');if(save)save.disabled=saving||!dirty||!settings.ready&&!offline;}
  async function refresh(){
    if(offline)return;
    const response=await context.fetch('/api/feature-access',{cache:'no-store'}),data=await response.json();
    if(!response.ok)throw new Error(data.error || "Access settings could not be refreshed.");
    accept(data,data.role);context.roleChanged?.(data.role);context.changed();
  }
  document.addEventListener("input",event=>{
    const input=event.target;if(!manager()||saving||!input.matches('[data-feature-message]'))return;
    draft[input.dataset.featureTier][input.dataset.featureMessage].message=input.value;dirty=true;error="";updateStatus();
  });
  document.addEventListener("change",event=>{
    const input=event.target;if(!manager()||saving||!input.matches('[data-feature-mode]')||input.dataset.featureMode==="profile")return;
    draft[input.dataset.featureTier][input.dataset.featureMode].mode=input.value;dirty=true;error="";updateStatus();
  });
  document.addEventListener("click",async event=>{
    const button=event.target.closest('[data-feature-save],[data-feature-reload]');if(!button||!manager()||saving)return;
    if(button.hasAttribute('data-feature-reload')){if(dirty&&!window.confirm('Discard unsaved feature settings and reload?'))return;dirty=false;error="";try{await refresh();}catch(e){error=e.message;updateStatus();}return;}
    for(const tier of ['associate','leader'])for(const [id]of features){const r=draft[tier][id];if(['preview','maintenance'].includes(r.mode)&&!r.message.trim()){error='Add a notice for each preview or maintenance feature.';updateStatus();return;}}
    saving=true;error="";context.changed();
    try{
      if(offline){settings={policy:structuredClone(draft),version:settings.version+1,ready:true};}
      else {const response=await context.fetch('/api/feature-access',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({policy:draft,version:draftVersion})}),data=await response.json();if(!response.ok)throw new Error(data.error||'Feature settings could not be saved.');settings=data;}
      dirty=false;draft=structuredClone(settings.policy);draftVersion=settings.version;
      if(typeof BroadcastChannel!=='undefined'&&!offline){const channel=new BroadcastChannel('tax-dashboard:feature-access');channel.postMessage('changed');channel.close();}
    }catch(e){error=e.message;}finally{saving=false;context.changed();}
  });
  window.WorkspaceFeatures={
    init(options){context=options;offline=options.offline;accept(options.settings,options.role);if(!offline&&typeof BroadcastChannel!=="undefined"){const channel=new BroadcastChannel('tax-dashboard:feature-access');channel.onmessage=()=>refresh().catch(e=>console.warn('[feature access]',e.message));}},
    accept, can, visible, manager, normalize, editor, chrome, blocked, refresh,
    featureForView:view=>views[view],
    mode:feature=>rule(feature).mode,
    setRole(next){role=String(next||'staff').toLowerCase();}
  };
})();
