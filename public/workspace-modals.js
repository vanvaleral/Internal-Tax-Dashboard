/* Bridge legacy renderers to native modal focus/top-layer behavior. */
(() => {
  "use strict";
  if (!window.HTMLDialogElement?.prototype.showModal) return;
  const hosts = new Map();
  const closeSelector = ["data-close-appearance-settings","data-close-client-editor","data-close-import-preview","data-close-client-duplicates","data-dismiss-fame-announcement","data-close-my-work-menu","data-cancel-annual-generation","data-cancel-monthly-generation"].map(name=>`button[${name}]`).join(",");
  let lastFocus = document.activeElement;
  document.addEventListener("focusin",event=>{ if (!event.target.closest?.("dialog.workspace-modal-host")) lastFocus = event.target; });

  function updateName(host,panel) {
    for (const name of ["aria-label","aria-labelledby","aria-describedby"]) {
      const value = panel.getAttribute(name);
      if (value !== null) host.setAttribute(name,value); else host.removeAttribute(name);
    }
    panel.removeAttribute("role"); panel.removeAttribute("aria-modal"); panel.dataset.workspaceModalPanel = "";
  }
  function focusPanel(panel) {
    const field = panel.querySelector("[autofocus]") || (panel.matches(".appearance-settings") ? panel.querySelector(closeSelector) : panel.querySelector('input:not([type="hidden"]):not([type="date"]):not(:disabled),textarea:not(:disabled),select:not(:disabled)')) || panel.querySelector(closeSelector);
    field?.focus({preventScroll:true});
  }
  function replacementInvoker(invoker) {
    if (!invoker || invoker.isConnected) return null;
    if (invoker.id) return document.getElementById(invoker.id);
    const attribute = [...(invoker.attributes || [])].find(item=>item.name.startsWith("data-"));
    return attribute ? [...document.querySelectorAll(`[${attribute.name}]`)].find(node=>node.getAttribute(attribute.name)===attribute.value) : null;
  }
  function release(host,entry) {
    hosts.delete(host);
    if (host.open) host.close();
    if (host.isConnected && entry.box.parentElement===host) host.before(entry.box);
    host.remove();
    // Native focus return handles intact invokers; only remounts need a replacement.
    replacementInvoker(entry.invoker)?.focus({preventScroll:true});
  }
  function sync() {
    if (!window.document?.body) return;
    // Release replaced hosts before opening replacements so old focus return
    // cannot steal focus from a newly opened dialog.
    for (const [host,entry] of hosts) {
      if (!host.isConnected || !entry.box.isConnected || !entry.box.querySelector("[data-workspace-modal-panel]")) release(host,entry);
    }
    for (const panel of document.querySelectorAll('[role="dialog"][aria-modal="true"]:not(dialog)')) {
      const existing = panel.closest("dialog.workspace-modal-host");
      if (existing) {
        const entry = hosts.get(existing); if (!entry) continue;
        entry.panel = panel; updateName(existing,panel);
        if (!existing.contains(document.activeElement)) focusPanel(panel);
        continue;
      }
      if (panel.closest("dialog")) continue;
      const box = panel.closest(".client-editor-backdrop,.my-work-time-dialog-backdrop,.fame-announcement-root") || panel.parentElement;
      const host = document.createElement("dialog"), entry = {box,panel,invoker:lastFocus};
      host.className = "workspace-modal-host";
      box.before(host); host.append(box); updateName(host,panel); hosts.set(host,entry);
      host.addEventListener("cancel",event=>{
        event.preventDefault();
        const close = entry.panel.querySelector(closeSelector);
        if (close && !close.disabled && entry.panel.getAttribute("aria-busy")!=="true") close.click();
        else {
          let notice = entry.panel.querySelector("[data-workspace-modal-wait]");
          if (!notice) { notice = document.createElement("p"); notice.dataset.workspaceModalWait=""; notice.setAttribute("role","status"); entry.panel.append(notice); }
          notice.textContent = "Please wait for the current save before closing.";
        }
      });
      host.showModal(); focusPanel(panel);
    }
  }
  new MutationObserver(records=>{
    if (hosts.size || records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1 && (node.matches('[role="dialog"][aria-modal="true"]') || node.querySelector('[role="dialog"][aria-modal="true"]'))))) sync();
  }).observe(document.body,{childList:true,subtree:true});
  window.WorkspaceModals = {sync};
  sync();
})();
