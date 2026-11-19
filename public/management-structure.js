(() => {
  "use strict";
  const kinds = ["Partner", "Team", "Role"];
  const maxPlans = 20, maxNodes = 100, maxDepth = 6;
  const roleLabels = { partner:"Partner", supervisor:"Supervisor", leader:"Leader", staff:"Associate", admin:"Admin" };
  const cardWidth = 176, cardHeight = 84, columnGap = 28, rowGap = 50, padding = 24;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const nextId = rows => String(1 + Math.max(0, ...rows.map(row => Number(row.id) || 0)));
  const option = (value, label, active) => `<option value="${esc(value)}" ${value === active ? "selected" : ""}>${esc(label)}</option>`;

  function validate(nodes) {
    if (nodes.some(node => !node || typeof node.id !== "string" || !node.id || typeof node.parent !== "string")) return false;
    const byId = new Map(nodes.map(node => [node.id, node]));
    if (byId.size !== nodes.length) return false;
    return nodes.every(node => {
      const lineage = new Set([node.id]);
      let parent = node.parent;
      while (parent) {
        if (!byId.has(parent) || lineage.has(parent) || lineage.size >= maxDepth) return false;
        lineage.add(parent);
        parent = byId.get(parent).parent;
      }
      return true;
    });
  }

  function layout(nodes) {
    const branches = new Map();
    for (const node of nodes) {
      if (!branches.has(node.parent)) branches.set(node.parent, []);
      branches.get(node.parent).push(node);
    }
    const points = new Map();
    let leaves = 0, height = 0;
    function place(node, depth) {
      const columns = (branches.get(node.id) || []).map(child => place(child, depth + 1));
      const x = columns.length ? (columns[0] + columns.at(-1)) / 2 : padding + leaves++ * (cardWidth + columnGap);
      const y = padding + depth * (cardHeight + rowGap);
      points.set(node.id, {x,y});
      height = Math.max(height, y + cardHeight + padding);
      return x;
    }
    for (const node of branches.get("") || []) place(node,0);
    return {points, width: Math.max(2*padding + cardWidth, leaves*(cardWidth + columnGap) - columnGap + 2*padding), height};
  }

  function create({ account, canManage, safeHtml }) {
    const key = `tax-dashboard:structure:v1:${account}`;
    let model = { active: "1", plans: [{ id: "1", name: "Company structure", nodes: [] }] };
    let baseline = null, storageError = "", host, editing = "", rosterKey, people = new Map();
    let pending = null, drag = null;
    try {
      baseline = localStorage.getItem(key);
      if (baseline) {
        const stored = JSON.parse(baseline);
        if (!Array.isArray(stored.plans) || !stored.plans.length || stored.plans.length > maxPlans ||
            !stored.plans.some(plan => plan.id === stored.active) ||
            !stored.plans.every(plan => Array.isArray(plan.nodes) && plan.nodes.length <= maxNodes && validate(plan.nodes))) {
          throw new Error("Invalid structure");
        }
        model = stored;
      }
    } catch {
      storageError = "Saved plans could not be read. Reload before editing.";
    }

    const active = () => model.plans.find(plan => plan.id === model.active);
    const tell = message => { host.querySelector("[data-structure-status]").textContent = message; };
    const save = (draft, message, resetEditor = false) => {
      if (storageError) { tell(storageError); return false; }
      try {
        if (localStorage.getItem(key) !== baseline) { tell("This browser has a newer copy. Reload before editing."); return false; }
        const json = JSON.stringify(draft);
        localStorage.setItem(key, json);
        baseline = json;
      } catch {
        tell("Could not save this change. Your previous plan is unchanged.");
        return false;
      }
      model = draft;
      if (resetEditor) editing = "";
      pending = null;
      render(message);
      return true;
    };

    const personName = node => people.get(node.pic)?.name || node.picName || "";
    const nodeName = node => personName(node) || node.label;
    const usedByAnother = (pic, id) => active().nodes.some(node => node.pic === pic && node.id !== id);
    function flow(nodes, printable = false) {
      const {points,width,height} = layout(nodes);
      const scale = Math.min(1, 950 / width, 590 / height);
      if (printable && scale < .56) return chart(nodes);
      const wires = nodes.filter(node => node.parent).map(node => {
        const child = points.get(node.id), parent = points.get(node.parent);
        const mid = parent.y + cardHeight + rowGap/2;
        return `<path d="M ${parent.x+cardWidth/2} ${parent.y+cardHeight} V ${mid} H ${child.x+cardWidth/2} V ${child.y}"></path>`;
      }).join("");
      const cards = nodes.map(node => {
        const {x,y} = points.get(node.id), name = nodeName(node);
        const parent = nodes.find(item => item.id === node.parent);
        const detail = personName(node) ? node.label : "Unassigned / planned";
        const label = `${name}, ${detail}, ${parent ? "reports to " + nodeName(parent) : "top level"}`;
        const content = `<small>${esc(node.kind)}</small><strong title="${esc(name)}">${esc(name)}</strong><span title="${esc(detail)}">${esc(detail)}</span>`;
        return `<article class="structure-card${node.id === editing && !printable ? " is-selected" : ""}" data-structure-node="${esc(node.id)}" data-kind="${esc(node.kind)}" style="left:${x}px;top:${y}px">${printable
          ? `<div class="structure-card-main">${content}</div>`
          : `<button type="button" class="structure-card-main" data-structure-edit="${esc(node.id)}" aria-label="${esc(label)}">${content}</button>
             <button type="button" class="structure-grip" data-structure-move="${esc(node.id)}" ${storageError ? "disabled" : ""} title="Drag or click to connect" aria-label="Move or connect ${esc(name)}"><span aria-hidden="true"></span></button>`}</article>`;
      }).join("");
      return `<div class="structure-flow" style="width:${width}px;height:${height}px;--structure-print-scale:${scale}"><svg class="structure-wires" width="${width}" height="${height}" aria-hidden="true">${wires}</svg>${cards}</div>`;
    }

    // Large charts print as a hierarchy rather than shrinking the labels past readability.
    function chart(nodes, parent = "") {
      const children = nodes.filter(node => node.parent === parent);
      if (!children.length) return "";
      return `<ul class="structure-tree">${children.map(node => `<li><div class="structure-node">
        <div><small>${esc(node.kind)}</small><strong>${esc(node.label)}</strong>
        <span>${esc(personName(node) || "Unassigned")}</span></div>
        </div>${chart(nodes, node.id)}</li>`).join("")}</ul>`;
    }

    function render(message = storageError) {
      const plan = active(), node = plan.nodes.find(row => row.id === editing);
      const list = [...people].filter(([id]) => !usedByAnother(id));
      const oldCanvas = host.querySelector(".structure-viewport");
      const scroll = oldCanvas ? [oldCanvas.scrollLeft, oldCanvas.scrollTop] : null;
      const parentOptions = plan.nodes.filter(row => !node || (row.id !== node.id &&
        validate(plan.nodes.map(entry => entry.id === node.id ? {...entry, parent: row.id} : entry))));
      const locked = storageError ? "disabled" : "";
      host.innerHTML = safeHtml(`
        <div class="section-title"><div><div class="eyebrow">Organization planning</div><h3>Structure Lab</h3><p>Plan reporting lines without changing live assignments or access. Scenarios stay in this browser.</p></div>
          <button type="button" class="ghost-btn" data-structure-action="print" ${plan.nodes.length ? "" : "disabled"}>Print</button></div>
        <div class="structure-toolbar">
          <label>Scenario <select class="field" data-structure-plan ${locked}>${model.plans.map(row => option(row.id,row.name,plan.id)).join("")}</select></label>
          <form data-structure-form="name" aria-label="Rename scenario"><label>Scenario name <input class="field" name="scenarioTitle" maxlength="100" required value="${esc(plan.name)}"></label>
            <button type="submit" class="ghost-btn" ${locked}>Rename</button></form>
          <button type="button" class="ghost-btn" data-structure-action="new" ${locked}>New scenario</button>
          <button type="button" class="ghost-btn" data-structure-action="copy" ${locked}>Duplicate</button>
          <button type="button" class="ghost-btn" data-structure-action="delete-plan" ${locked || (model.plans.length < 2 ? "disabled" : "")}>Delete scenario</button>
        </div>
        <p class="subline" role="status" data-structure-status>${esc(message)}</p>
        <div class="structure-layout">
          <section class="structure-chart" aria-label="Reporting structure">
            <header class="structure-chart-head"><div><h4>${esc(plan.name)}</h4><p>Drop a PIC or drag a card by its grip onto a manager.</p></div><span class="pill neutral">${plan.nodes.length} position${plan.nodes.length === 1 ? "" : "s"}</span></header>
            <div class="structure-viewport" tabindex="0" aria-label="Organization chart, scroll to see more positions">
              <button type="button" class="ghost-btn structure-top" data-structure-top ${locked} aria-disabled="${!pending}">+ Drop here for a top-level position</button>
              ${plan.nodes.length ? flow(plan.nodes) : '<p class="structure-empty">Drag a PIC to the top-level drop zone, or add a planned position.</p>'}
            </div>
          </section>
          <div class="structure-rail">
          <section class="structure-roster" aria-label="Available PICs">
            <div class="eyebrow">Live PIC directory</div><h4>Available PICs</h4>
            <p>Drag a name by its grip, or select it and choose where it reports.</p>
            <ul>${list.map(([id,person]) => `<li><button type="button" data-structure-pic="${esc(id)}" aria-pressed="${pending?.pic === id}" ${locked}><strong>${esc(person.name)}</strong><small>${esc(person.roleLabel)}</small><span class="structure-grip-dots" data-structure-roster-grip aria-hidden="true"></span></button></li>`).join("") || "<li>No unplaced active PICs.</li>"}</ul>
          </section>
          <form class="structure-editor" data-structure-form="node" aria-labelledby="structure-form-heading">
            <h4 id="structure-form-heading">${node ? "Edit position" : "Add to chart"}</h4>
            <label>Position or team name <input class="field" name="label" maxlength="100" required placeholder="e.g. Managing Partner" value="${esc(node?.label)}"></label>
            <label>Type <select class="field" name="kind">${kinds.map(kind => option(kind,kind,node?.kind || "Partner")).join("")}</select></label>
            <label>Reports to <select class="field" name="parent">${option("","Top level",node?.parent || "")}${parentOptions.map(row => option(row.id,`${nodeName(row)} (${row.kind})`,node?.parent)).join("")}</select></label>
            <label>PIC <select class="field" name="pic">${option("","Unassigned / future PIC",node?.pic || "")}
              ${node?.pic && !people.has(node.pic) ? option(node.pic,`${node.picName || "Previous PIC"} (not in directory)`,node.pic) : ""}
              ${[...people].filter(([id]) => id === node?.pic || !usedByAnother(id)).map(([id,person]) => option(id,person.name,node?.pic)).join("")}</select></label>
            <div class="structure-actions"><button type="submit" class="solid-btn" ${locked}>${node ? "Save position" : "Add position"}</button>
              ${node ? `<button type="button" class="ghost-btn" data-structure-action="cancel">Cancel</button><button type="button" class="ghost-btn" data-structure-action="remove" ${locked}>Remove</button>` : ""}</div>
          </form></div>
        </div>`);
      if (scroll) {
        const canvas = host.querySelector(".structure-viewport");
        [canvas.scrollLeft,canvas.scrollTop] = scroll;
      }
    }

    function print() {
      const plan = active(), printable = document.createElement("section");
      printable.innerHTML = safeHtml(`<h2>${esc(plan.name)}</h2>${flow(plan.nodes,true)}`);
      const page = window.open("", "_blank", "width=960,height=760");
      if (!page) { tell("Allow popups to print this structure."); return; }
      page.opener = null;
      const doc = page.document;
      doc.documentElement.lang = "en";
      doc.title = "Tax Dashboard | Structure";
      const style = doc.createElement("style"), title = doc.createElement("h1"), note = doc.createElement("p");
      style.textContent = "@page{size:A4 landscape;margin:12mm}body{font:12px 'Segoe UI',sans-serif;color:#162b31;margin:7mm}h1{border-bottom:2px solid #137d80;padding-bottom:8px}.structure-flow{position:relative;zoom:var(--structure-print-scale);break-inside:avoid}.structure-wires{position:absolute;inset:0;fill:none;stroke:#578778;stroke-width:1.75}.structure-card{box-sizing:border-box;position:absolute;width:176px;height:84px;border:1px solid #7ea699;border-top:3px solid #137d80;border-radius:8px;background:#fff}.structure-card-main{padding:8px}.structure-card-main>*{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.structure-tree{list-style:none;margin:0;padding-left:18px;border-left:1px solid #99afb0}.structure-node{border-bottom:1px solid #c6d5d4;padding:6px 0;break-inside:avoid;overflow-wrap:anywhere}small,strong{display:block}@media print{body{margin:0}}";
      title.textContent = "LMATS Consulting | Organization Structure";
      note.textContent = "Planning scenario only. Does not reflect or change system access.";
      doc.head.append(style);
      doc.body.append(title, note, doc.importNode(printable, true));
      page.focus();
      page.print();
    }

    const find = id => active().nodes.find(node => node.id === id);
    const focusCard = id => [...host.querySelectorAll("[data-structure-edit]")].find(button => button.dataset.structureEdit === id)?.focus();
    const dropPlan = (id, parent) => active().nodes.map(node => node.id === id ? {...node,parent} : node);
    function canPlace(source, parent) {
      if (!source || storageError || (parent && !find(parent))) return false;
      if (source.pic) {
        if (!people.has(source.pic) || usedByAnother(source.pic) || active().nodes.length >= maxNodes) return false;
        return validate([...active().nodes,{id:nextId(active().nodes),parent}]);
      }
      return !!find(source.id) && source.id !== parent && validate(dropPlan(source.id,parent));
    }
    function place(source, parent, focus = false) {
      if (!canManage() || !canPlace(source,parent)) {
        tell("Choose a valid manager. Reporting lines cannot loop or exceed six levels.");
        return;
      }
      const draft = structuredClone(model), plan = draft.plans.find(item => item.id === draft.active);
      const person = people.get(source.pic), position = plan.nodes.find(node => node.id === source.id);
      const id = position?.id || nextId(plan.nodes);
      if (person) plan.nodes.push({id,parent,pic:source.pic,picName:person.name,label:person.title,kind:person.kind});
      else position.parent = parent;
      const name = person?.name || nodeName(position);
      const manager = parent ? nodeName(find(parent)) : "";
      if (save(draft,manager ? `${name} now reports to ${manager}.` : `${name} is now at the top level.`,true) && focus) focusCard(id);
    }
    function pick(source) {
      if (storageError) return;
      pending = source;
      const name = source.pic ? people.get(source.pic)?.name : nodeName(find(source.id));
      render(`Choose a manager for ${name}, or select the top-level drop zone. Escape cancels.`);
      host.querySelector("[data-structure-top]").focus();
    }
    function startDrag(event) {
      if (!canManage() || storageError || drag || !event.isPrimary || event.button !== 0) return;
      const button = event.target.closest("[data-structure-pic], [data-structure-move]");
      if (!button) return;
      if (event.pointerType === "touch" && button.dataset.structurePic && !event.target.closest("[data-structure-roster-grip]")) return;
      const source = button.dataset.structurePic ? {pic:button.dataset.structurePic} : {id:button.dataset.structureMove};
      drag = {source,pointer:event.pointerId,x:event.clientX,y:event.clientY};
      window.addEventListener("pointermove",moveDrag);
      window.addEventListener("pointerup",endDrag);
      window.addEventListener("pointercancel",endDrag);
    }
    function hitTarget(event) {
      const item = document.elementFromPoint(event.clientX,event.clientY)?.closest("[data-structure-node], [data-structure-top]");
      return item && host.contains(item) ? item : null;
    }
    function moveDrag(event) {
      if (!drag || event.pointerId !== drag.pointer) return;
      if (!host.isConnected || !canManage()) { clearDrag(); return; }
      if (!drag.ghost) {
        if (Math.hypot(event.clientX-drag.x,event.clientY-drag.y) < 6) return;
        pending = null;
        drag.ghost = document.createElement("div");
        drag.ghost.className = "structure-drag-ghost";
        drag.ghost.textContent = drag.source.pic ? people.get(drag.source.pic)?.name : nodeName(find(drag.source.id));
        drag.ghost.setAttribute("aria-hidden","true");
        document.body.append(drag.ghost);
        host.setPointerCapture?.(event.pointerId);
      }
      drag.ghost.style.transform = `translate(${event.clientX+12}px,${event.clientY+12}px)`;
      const hit = hitTarget(event);
      if (hit !== drag.hit) {
        drag.hit?.classList.remove("is-drop-target");
        drag.hit = hit;
        hit?.classList.toggle("is-drop-target",canPlace(drag.source,hit.dataset.structureNode || ""));
      }
    }
    function clearDrag() {
      drag?.ghost?.remove();
      drag?.hit?.classList.remove("is-drop-target");
      if (drag && host.hasPointerCapture?.(drag.pointer)) host.releasePointerCapture(drag.pointer);
      drag = null;
      window.removeEventListener("pointermove",moveDrag);
      window.removeEventListener("pointerup",endDrag);
      window.removeEventListener("pointercancel",endDrag);
    }
    function endDrag(event) {
      if (!drag || event.pointerId !== drag.pointer) return;
      const {source,ghost} = drag;
      const target = ghost && event.type === "pointerup" ? hitTarget(event) : null;
      clearDrag();
      if (!ghost || !host.isConnected || !canManage()) return;
      if (target) place(source,target.dataset.structureNode || "");
      else tell("No change. Drop onto a manager or the top-level drop zone.");
    }

    function onClick(event) {
      if (!canManage()) return;
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.structurePic && people.has(button.dataset.structurePic)) { pick({pic:button.dataset.structurePic}); return; }
      if (button.dataset.structureMove && find(button.dataset.structureMove)) { pick({id:button.dataset.structureMove}); return; }
      if (button.hasAttribute("data-structure-top")) {
        if (pending) place(pending,"",true);
        return;
      }
      if (button.dataset.structureEdit) {
        if (pending) { place(pending,button.dataset.structureEdit,true); return; }
        editing = button.dataset.structureEdit;
        render();
        host.querySelector('[name="label"]').focus();
        return;
      }
      const action = button.dataset.structureAction;
      if (action === "print") { print(); return; }
      if (action === "cancel") { editing = ""; pending = null; render(); return; }
      const draft = structuredClone(model), plan = draft.plans.find(item => item.id === draft.active);
      if (action === "new" || action === "copy") {
        if (draft.plans.length >= maxPlans) { tell(`Up to ${maxPlans} scenarios can be saved.`); return; }
        const id = nextId(draft.plans);
        draft.plans.push({id, name: action === "copy" ? `${plan.name.slice(0, 93)} (copy)` : "New scenario", nodes: action === "copy" ? structuredClone(plan.nodes) : []});
        draft.active = id;
      } else if (action === "delete-plan") {
        if (draft.plans.length < 2 || !window.confirm(`Delete "${plan.name}" from this browser?`)) return;
        draft.plans = draft.plans.filter(item => item.id !== plan.id);
        draft.active = draft.plans[0].id;
      } else if (action === "remove") {
        const node = plan.nodes.find(item => item.id === editing);
        if (!node || !window.confirm(`Remove "${node.label}"? Direct reports will move up one level.`)) return;
        plan.nodes = plan.nodes.filter(item => item.id !== node.id);
        for (const child of plan.nodes) if (child.parent === node.id) child.parent = node.parent;
      } else return;
      if (save(draft, "Scenario saved in this browser.", true) && action === "new") {
        host.querySelector('[name="scenarioTitle"]').focus();
        host.querySelector('[name="scenarioTitle"]').select();
      }
    }

    function onSubmit(event) {
      const form = event.target, type = form.dataset.structureForm;
      if (!type) return;
      event.preventDefault();
      if (!canManage()) return;
      const fields = new FormData(form);
      const value = field => String(fields.get(field) || "").trim().slice(0,100);
      const draft = structuredClone(model), plan = draft.plans.find(item => item.id === draft.active);
      if (type === "name") {
        if (!value("scenarioTitle")) { tell("Enter a scenario name."); return; }
        plan.name = value("scenarioTitle");
      } else {
        const index = plan.nodes.findIndex(item => item.id === editing), old = plan.nodes[index];
        if (!old && plan.nodes.length >= maxNodes) { tell(`Up to ${maxNodes} positions can be saved per scenario.`); return; }
        const label = value("label"), kind = value("kind"), pic = value("pic");
        if (!label || !kinds.includes(kind) || (pic && pic !== old?.pic && (!people.has(pic) || usedByAnother(pic,old?.id)))) { tell("Check the name, type and PIC."); return; }
        const node = { id: old?.id || nextId(plan.nodes), label, kind, parent: value("parent"), pic, picName: people.get(pic)?.name || (pic ? old?.picName || "" : "") };
        if (old) plan.nodes[index] = node; else plan.nodes.push(node);
        if (!validate(plan.nodes)) { tell(`Reporting lines cannot form a loop or exceed ${maxDepth} levels.`); return; }
      }
      if (save(draft, "Scenario saved in this browser.", type === "node")) {
        host.querySelector(type === "node" ? '[name="label"]' : '[name="scenarioTitle"]').focus();
      }
    }

    function mount(target, staff) {
      if (!canManage()) return;
      const roster = staff.filter(person => person.directory_active !== false && person.id && (person.display_name || person.full_name))
        .map(person => {
          const role = String(person.role || "staff").toLowerCase();
          const roleLabel = Object.hasOwn(roleLabels,role) ? roleLabels[role] : "PIC";
          return [person.id,{name:person.display_name || person.full_name,roleLabel,
            title:person.employment_title || roleLabel,kind:role === "partner" ? "Partner" : "Role"}];
        }).sort((a,b) => a[1].name.localeCompare(b[1].name));
      const signature = JSON.stringify(roster);
      if (target === host && signature === rosterKey) return;
      if (drag) clearDrag();
      pending = null;
      if (target !== host) {
        host = target;
        host.addEventListener("click", onClick);
        host.addEventListener("pointerdown", startDrag);
        host.addEventListener("lostpointercapture", event => {
          if (drag?.pointer === event.pointerId) clearDrag();
        });
        host.addEventListener("keydown", event => {
          if (event.key !== "Escape" || (!pending && !drag)) return;
          const source = pending || drag?.source;
          clearDrag();
          pending = null;
          render("Connection canceled.");
          [...host.querySelectorAll("[data-structure-pic], [data-structure-move]")].find(button =>
            source.pic ? button.dataset.structurePic === source.pic : button.dataset.structureMove === source.id)?.focus();
        });
        host.addEventListener("submit", onSubmit);
        host.addEventListener("change", event => {
          if (!canManage() || !event.target.matches("[data-structure-plan]")) return;
          if (!model.plans.some(plan => plan.id === event.target.value) ||
              !save({...model, active: event.target.value}, "Scenario selected.", true)) event.target.value = model.active;
        });
      }
      rosterKey = signature;
      people = new Map(roster);
      render();
    }
    return { mount };
  }
  window.ManagementStructure = { create };
})();
