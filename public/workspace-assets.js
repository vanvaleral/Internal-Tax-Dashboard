/* Reviewed UI code only. This loader never reads or caches business records. */
(() => {
  "use strict";
  const files = {
    assessment:{file:"case-assessment-dashboard.js",ready:()=>Boolean(window.CaseAssessmentUI)},
    report:{file:"case-report.js",ready:()=>Boolean(window.CaseReports)},
    caseStyle:{file:"case-workflow-dashboard.css",style:true},
    allocation:{file:"allocation-report.js",ready:()=>Boolean(window.AllocationReports)},
    allocationSheet:{file:"allocation-sheet.js",revisionMeta:"workspace-allocation-revision",ready:()=>typeof window.AllocationSheet?.create === "function"}
  };
  const groups = {cases:["assessment","report","caseStyle"],"allocation-pdf":["allocation"],"allocation-sheet":["allocationSheet"]};
  const pending = new Map(), complete = new Set();
  const readyFile = key => complete.has(key) || Boolean(files[key].ready?.());
  function ready(group) { return Object.hasOwn(groups,group) && groups[group].every(readyFile); }
  function loadFile(key) {
    if (readyFile(key)) return Promise.resolve();
    if (pending.has(key)) return pending.get(key);
    const entry = files[key], node = document.createElement(entry.style ? "link" : "script");
    const url = new URL(entry.file,location.href);
    const version = entry.revisionMeta && document.querySelector(`meta[name="${entry.revisionMeta}"]`)?.content;
    if (/^[a-f0-9]{12}$/.test(version || "")) url.searchParams.set("v",version);
    if (entry.style) { node.rel="stylesheet"; node.href=url.href; }
    else { node.src=url.href; node.async=true; }
    const promise = new Promise((resolve,reject) => {
      const failed = () => { pending.delete(key); node.remove(); reject(new Error(`Could not load ${entry.file}. Check your connection and retry.`)); };
      node.addEventListener("error",failed,{once:true});
      node.addEventListener("load",()=>{
        if (!entry.style && !entry.ready()) { failed(); return; }
        complete.add(key); pending.delete(key); resolve();
      },{once:true});
    });
    pending.set(key,promise);
    document.head.append(node);
    return promise;
  }
  function load(group) {
    if (!Object.hasOwn(groups,group)) return Promise.reject(new Error("Unknown workspace feature."));
    return Promise.all(groups[group].map(loadFile));
  }
  window.WorkspaceAssets = {load,ready};
})();
