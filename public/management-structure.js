(() => {
  "use strict";
  const kinds = ["Partner", "Team", "Role"];
  const maxPlans = 20, maxNodes = 100, maxDepth = 6;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const nextId = rows => String(1 + Math.max(0, ...rows.map(row => Number(row.id) || 0)));
  const option = (value, label, active) => `<option value="${esc(value)}" ${value === active ? "selected" : ""}>${esc(label)}</option>`;

  function validate(nodes) {
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

  function create({ account, canManage, safeHtml }) {
    const key = `tax-dashboard:structure:v1:${account}`;
    let model = { active: "1", plans: [{ id: "1", name: "Company structure", nodes: [] }] };
    let baseline = null, storageError = "", host, editing = "", rosterKey, people = new Map();
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
      render(message);
      return true;
    };

    function chart(nodes, parent = "") {
      const children = nodes.filter(node => node.parent === parent);
      if (!children.length) return "";
      return `<ul class="structure-tree">${children.map(node => `<li><div class="structure-node">
        <div><small>${esc(node.kind)}</small><strong>${esc(node.label)}</strong>
        <span>${esc(people.get(node.pic) || node.picName || "Unassigned")}</span></div>
        <button type="button" class="ghost-btn" data-structure-edit="${esc(node.id)}" aria-label="Edit ${esc(node.label)}">Edit</button>
        </div>${chart(nodes, node.id)}</li>`).join("")}</ul>`;
    }

    function render(message = storageError) {
      const plan = active(), node = plan.nodes.find(row => row.id === editing);
      const parentOptions = plan.nodes.filter(row => !node || (row.id !== node.id &&
        validate(plan.nodes.map(entry => entry.id === node.id ? {...entry, parent: row.id} : entry))));
      const locked = storageError ? "disabled" : "";
      host.innerHTML = safeHtml(`
        <div class="section-title"><div><h3>Structure</h3><p>Plan reporting lines, teams and partners without changing live assignments or access. Scenarios stay in this browser.</p></div>
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
          <section class="structure-chart" aria-label="Reporting structure"><h4>${esc(plan.name)}</h4>
            ${chart(plan.nodes) || "<p>Add a partner, team or role to start the chart.</p>"}</section>
          <form class="structure-editor" data-structure-form="node" aria-labelledby="structure-form-heading">
            <h4 id="structure-form-heading">${node ? "Edit position" : "Add to chart"}</h4>
            <label>Position or team name <input class="field" name="label" maxlength="100" required placeholder="e.g. Managing Partner" value="${esc(node?.label)}"></label>
            <label>Type <select class="field" name="kind">${kinds.map(kind => option(kind,kind,node?.kind || "Partner")).join("")}</select></label>
            <label>Reports to <select class="field" name="parent">${option("","Top level",node?.parent || "")}${parentOptions.map(row => option(row.id,`${row.label} (${row.kind})`,node?.parent)).join("")}</select></label>
            <label>PIC <select class="field" name="pic">${option("","Unassigned / future PIC",node?.pic || "")}
              ${node?.pic && !people.has(node.pic) ? option(node.pic,`${node.picName || "Previous PIC"} (not in directory)`,node.pic) : ""}
              ${[...people].map(([id,name]) => option(id,name,node?.pic)).join("")}</select></label>
            <div class="structure-actions"><button type="submit" class="solid-btn" ${locked}>${node ? "Save position" : "Add position"}</button>
              ${node ? `<button type="button" class="ghost-btn" data-structure-action="cancel">Cancel</button><button type="button" class="ghost-btn" data-structure-action="remove" ${locked}>Remove</button>` : ""}</div>
          </form>
        </div>`);
    }

    function print() {
      const chart = host.querySelector(".structure-chart").cloneNode(true);
      chart.querySelectorAll("button").forEach(button => button.remove());
      const page = window.open("", "_blank", "width=960,height=760");
      if (!page) { tell("Allow popups to print this structure."); return; }
      page.opener = null;
      const doc = page.document;
      doc.documentElement.lang = "en";
      doc.title = "Tax Dashboard | Structure";
      const style = doc.createElement("style"), title = doc.createElement("h1"), note = doc.createElement("p");
      style.textContent = "@page{size:A4;margin:14mm}body{font:12px 'Segoe UI',sans-serif;color:#162b31;margin:7mm}h1{border-bottom:2px solid #137d80;padding-bottom:8px}small,strong{display:block}.structure-tree{list-style:none;margin:0;padding-left:18px;border-left:1px solid #99afb0}.structure-node{border-bottom:1px solid #c6d5d4;padding:6px 0;break-inside:avoid;overflow-wrap:anywhere}@media print{body{margin:0}}";
      title.textContent = "LMATS Consulting | Organization Structure";
      note.textContent = "Planning scenario only. Does not reflect or change system access.";
      doc.head.append(style);
      doc.body.append(title, note, doc.importNode(chart, true));
      page.focus();
      page.print();
    }

    function onClick(event) {
      if (!canManage()) return;
      const button = event.target.closest("button");
      if (!button) return;
      if (button.dataset.structureEdit) {
        editing = button.dataset.structureEdit;
        render();
        host.querySelector('[name="label"]').focus();
        return;
      }
      const action = button.dataset.structureAction;
      if (action === "print") { print(); return; }
      if (action === "cancel") { editing = ""; render(); return; }
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
        if (!label || !kinds.includes(kind) || (pic && !people.has(pic) && pic !== old?.pic)) { tell("Check the name, type and PIC."); return; }
        const node = { id: old?.id || nextId(plan.nodes), label, kind, parent: value("parent"), pic, picName: people.get(pic) || (pic ? old?.picName || "" : "") };
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
        .map(person => [person.id, person.display_name || person.full_name]).sort((a,b) => a[1].localeCompare(b[1]));
      const signature = JSON.stringify(roster);
      if (target === host && signature === rosterKey) return;
      if (target !== host) {
        host = target;
        host.addEventListener("click", onClick);
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
