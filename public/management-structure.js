(() => {
  "use strict";
  const kinds = ["Partner", "Supervisor", "Leader", "Team", "Role"];
  const maxPlans = 20, maxNodes = 100, maxDepth = 6;
  const roleLabels = { partner:"Partner", supervisor:"Supervisor", leader:"Leader", staff:"Associate", admin:"Admin" };
  const cardWidth = 176, cardHeight = 84, columnGap = 28, rowGap = 50, padding = 24;
  const zoomLevels = [.25,.5,.75,1,1.25,1.5,2];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const nextId = rows => String(1 + Math.max(0, ...rows.map(row => Number(row.id) || 0)));
  const option = (value, label, active) => `<option value="${esc(value)}" ${value === active ? "selected" : ""}>${esc(label)}</option>`;
  const nameKey = value => String(value || "").trim().replace(/\s+/g," ").toLowerCase();
  const ownerRoles = ["partner","supervisor","leader"];

  function resolveStaff(people) {
    const aliases = new Map();
    for (const [id,person] of people) {
      for (const name of [person.name,person.fullName]) {
        const key = nameKey(name);
        if (!key) continue;
        if (!aliases.has(key)) aliases.set(key,new Set());
        aliases.get(key).add(id);
      }
    }
    return ([id,name] = []) => {
      if (id) return id;
      const matches = aliases.get(nameKey(name));
      return matches?.size === 1 ? matches.values().next().value : "";
    };
  }

  function assignment(client, role) {
    return client.reportingAssignments?.[role] || (role === "tax"
      ? [client.taxPicProfileId,client.taxPic] : [client.accountingPicProfileId,client.accountingPic]);
  }

  function reviewReportingLines(nodes, people, clients) {
    const resolve = resolveStaff(people);
    const byId = new Map(nodes.map(node => [node.id,node]));
    const positions = new Map(), chartRoles = new Map(), identities = new Map();
    for (const node of nodes) {
      const kind = nameKey(node.kind);
      // Older charts can have a manually named partner. Only resolve an exact, unique directory match.
      const id = node.pic || (ownerRoles.includes(kind) ? resolve(["",node.label]) : "");
      const role = ownerRoles.includes(kind) ? kind : people.get(id)?.role;
      identities.set(node.id,id);
      chartRoles.set(node.id,role);
      if (id) {
        if (!positions.has(id)) positions.set(id,[]);
        positions.get(id).push(node);
      }
    }
    const branchFor = id => {
      const assigned = positions.get(id);
      if (assigned?.length !== 1) return [];
      const branch = [];
      for (let node = assigned[0]; node; node = byId.get(node.parent)) branch.push(node);
      return branch;
    };
    const details = [];
    for (const client of clients) {
      if (nameKey(client.clientStatus) !== "active") continue;
      const fields = client.reportingAssignments || {};
      const owners = [
        {area:"Partner", pair:fields.partner || [client.partnerProfileId,client.partner]},
        {area:"Leader / Supervisor", pair:fields.supervisor || [client.supervisorProfileId,client.supervisor]}
      ].filter(({pair:[id,name]}) => id || nameKey(name));
      for (const [duty,pair] of [
        ["Tax PIC",assignment(client,"tax")],
        ["Accounting PIC",assignment(client,"accounting")]
      ]) {
        if (!pair[0] && !nameKey(pair[1])) continue;
        const pic = resolve(pair), branch = branchFor(pic);
        const entry = {client,duty,pic:people.get(pic)?.name || pair[1] || "Unlisted PIC"};
        if (!owners.length) {
          details.push({...entry,area:"Ownership",expected:"Not recorded",actual:"",issue:"Client has no Partner or Supervisor recorded."});
          continue;
        }
        for (const {area,pair:owner} of owners) {
          const expectedId = resolve(owner);
          const expected = people.get(expectedId)?.name || owner[1] || "Unlisted owner";
          const issue = value => details.push({...entry,area,expected,actual:"",issue:value});
          if (!pic || !expectedId) { issue("Check the PIC or owner name in the directory."); continue; }
          if (!branch.length) { issue(positions.has(pic) ? "PIC is linked to multiple chart positions." : "PIC is not linked in this scenario."); continue; }
          const chartOwnerRoles = [...new Set((positions.get(expectedId) || []).map(node => chartRoles.get(node.id))
            .filter(role => role === "leader" || role === "supervisor"))];
          const directoryRole = people.get(expectedId)?.role;
          const kind = area === "Partner" ? "partner" : chartOwnerRoles.length === 1 ? chartOwnerRoles[0] : directoryRole;
          if (!ownerRoles.includes(kind) || (area !== "Partner" && kind === "partner")) {
            issue("The saved Supervisor is not identified as a Leader or Supervisor.");
            continue;
          }
          const head = branch.find(node => chartRoles.get(node.id) === kind);
          if (!head || !identities.get(head.id)) { issue(`No linked ${kind} on the PIC's branch.`); continue; }
          const actualId = identities.get(head.id);
          if (actualId !== expectedId) details.push({...entry,area,expected,actual:people.get(actualId)?.name || head.picName || head.label});
        }
      }
    }
    return details.sort((a,b) => String(a.client.name || "").localeCompare(String(b.client.name || "")) ||
      a.duty.localeCompare(b.duty) || a.area.localeCompare(b.area));
  }

  const clientKey = client => String(client.databaseId || client.id || "");
  function teamSplitRows(plan, people, clients, split, mode, drafts) {
    const resolve = resolveStaff(people);
    const byId = new Map(plan.nodes.map(node => [node.id,node]));
    const memberships = new Map();
    for (const position of plan.nodes) {
      const kind = nameKey(position.kind);
      const id = position.pic || (ownerRoles.includes(kind) ? resolve(["",position.label]) : "");
      if (!id) continue;
      let node = position;
      while (node && node.id !== split.a && node.id !== split.b) node = byId.get(node.parent);
      if (!memberships.has(id)) memberships.set(id,new Set());
      memberships.get(id).add(node?.id || "");
    }
    const project = (client, next) => ["tax","accounting"].map(role => {
      const current = assignment(client,role);
      const proposed = next ? drafts[client.id]?.[role === "tax" ? "nextTaxPic" : "nextAccPic"] : null;
      const before = resolve(current);
      // Allocation initializes both draft fields. Preserve the current stable ID when a copied label is unchanged.
      const label = proposed ?? (people.get(before)?.name || current[1] || "");
      const assigned = proposed != null ? Boolean(nameKey(proposed)) : Boolean(current[0] || nameKey(current[1]));
      const same = proposed == null || [current[1],people.get(before)?.name].some(name => nameKey(name) === nameKey(proposed));
      const id = assigned ? (same ? before : resolve(["",proposed])) : "";
      const branches = memberships.get(id);
      return {assigned,label:assigned ? (people.get(id)?.name || label || "Unlisted PIC") : "Unassigned",
        team:branches?.size === 1 ? branches.values().next().value : ""};
    });
    const ownerSuggestion = assignments => {
      const assigned = assignments.filter(item => item.assigned);
      return assigned.length && assigned[0].team && assigned.every(item => item.team === assigned[0].team) ? assigned[0].team : "";
    };
    return clients.filter(client => nameKey(client.clientStatus) === "active" && clientKey(client)).map(client => {
      const current = project(client,false);
      const shown = mode === "next" ? project(client,true) : current;
      const key = clientKey(client);
      const stored = Object.hasOwn(split.owners,key) ? split.owners[key] : "";
      const owner = stored === split.a || stored === split.b ? stored : "";
      const suggested = ownerSuggestion(current);
      const assigned = shown.filter(item => item.assigned);
      const teams = new Set(assigned.map(item => item.team).filter(Boolean));
      const conflict = Boolean(owner && [...teams].some(team => team !== owner));
      const cross = teams.size > 1;
      const incomplete = !assigned.length || assigned.some(item => !item.team);
      const projectedTeam = ownerSuggestion(shown);
      const moved = !owner && mode === "next" && !!suggested && !!projectedTeam && suggested !== projectedTeam;
      return {client,key,shown,owner,suggested,conflict,cross,incomplete,moved};
    }).sort((a,b) => String(a.client.name || "").localeCompare(String(b.client.name || "")));
  }

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

  function create({ account, canManage, safeHtml, getAllocationDrafts = () => ({}) }) {
    const key = `tax-dashboard:structure:v1:${account}`;
    let model = { active: "1", plans: [{ id: "1", name: "Company structure", nodes: [] }] };
    let baseline = null, storageError = "", host, editing = "", rosterKey, people = new Map();
    let pending = null, drag = null;
    let zoom = 1;
    let clientRows = null, section = "chart", reviewFilter = "conflicts", chartScroll = [0,0];
    let splitMode = "current", splitFilter = "all";
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
    function connections(nodes, points) {
      return nodes.filter(node => node.parent).map(node => {
        const child = points.get(node.id), parent = points.get(node.parent);
        const mid = parent.y + cardHeight + rowGap/2;
        return `<path d="M ${parent.x+cardWidth/2} ${parent.y+cardHeight} V ${mid} H ${child.x+cardWidth/2} V ${child.y}"></path>`;
      }).join("");
    }

    function flow(nodes) {
      const {points,width,height} = layout(nodes);
      const wires = connections(nodes,points);
      const cards = nodes.map(node => {
        const {x,y} = points.get(node.id), name = nodeName(node);
        const parent = nodes.find(item => item.id === node.parent);
        const detail = personName(node) ? node.label : "Unassigned / planned";
        const label = `${name}, ${detail}, ${parent ? "reports to " + nodeName(parent) : "top level"}`;
        const content = `<small>${esc(node.kind)}</small><strong title="${esc(name)}">${esc(name)}</strong><span title="${esc(detail)}">${esc(detail)}</span>`;
        return `<article class="structure-card${node.id === editing ? " is-selected" : ""}" data-structure-node="${esc(node.id)}" data-kind="${esc(node.kind)}" style="left:${x}px;top:${y}px">
          <button type="button" class="structure-card-main" data-structure-edit="${esc(node.id)}" aria-label="${esc(label)}">${content}</button>
          <button type="button" class="structure-grip" data-structure-move="${esc(node.id)}" ${storageError ? "disabled" : ""} title="Drag or click to connect" aria-label="Move or connect ${esc(name)}"><span aria-hidden="true"></span></button></article>`;
      }).join("");
      return `<div class="structure-flow" data-width="${width}" data-height="${height}" style="width:${width}px;height:${height}px"><svg class="structure-wires" width="${width}" height="${height}" aria-hidden="true">${wires}</svg>${cards}</div>`;
    }

    function updateZoom() {
      const stage = host.querySelector(".structure-stage");
      if (stage) {
        const graph = stage.firstElementChild;
        stage.style.width = `${Math.ceil(Number(graph.dataset.width)*zoom)}px`;
        stage.style.height = `${Math.ceil(Number(graph.dataset.height)*zoom)}px`;
        graph.style.transform = `scale(${zoom})`;
      }
      host.querySelector('[data-structure-zoom="reset"]').textContent = `${Math.round(zoom*100)}%`;
      host.querySelector('[data-structure-zoom="out"]').disabled = !stage || zoom <= zoomLevels[0];
      host.querySelector('[data-structure-zoom="in"]').disabled = !stage || zoom >= zoomLevels.at(-1);
    }

    function changeZoom(action) {
      const viewport = host.querySelector(".structure-viewport");
      const stage = viewport.querySelector(".structure-stage");
      if (!stage || drag) return;
      const graph = stage.firstElementChild;
      const width = Number(graph.dataset.width), height = Number(graph.dataset.height);
      const centerX = (viewport.scrollLeft + viewport.clientWidth/2 - stage.offsetLeft) / zoom;
      const centerY = (viewport.scrollTop + viewport.clientHeight/2 - stage.offsetTop) / zoom;
      if (action === "in") zoom = zoomLevels.find(step => step > zoom) ?? zoom;
      if (action === "out") zoom = zoomLevels.findLast(step => step < zoom) ?? zoom;
      if (action === "reset") zoom = 1;
      if (action === "fit") {
        const availableHeight = viewport.clientHeight - stage.offsetTop - 4;
        zoom = Math.max(.01, Math.floor(100 * Math.min(1,(viewport.clientWidth-4)/width,availableHeight/height))/100);
      }
      updateZoom();
      if (action === "fit") {
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
      } else {
        viewport.scrollLeft = Math.max(0, stage.offsetLeft + centerX*zoom - viewport.clientWidth/2);
        viewport.scrollTop = Math.max(0, stage.offsetTop + centerY*zoom - viewport.clientHeight/2);
      }
    }

    function conflictView(plan) {
      if (!clientRows) return '<section class="structure-review"><p role="status">Waiting for confirmed Client Master data.</p></section>';
      const findings = reviewReportingLines(plan.nodes,people,clientRows);
      const conflicts = findings.filter(row => !row.issue);
      const review = findings.filter(row => row.issue);
      const count = rows => new Set(rows.map(row => row.client.databaseId || row.client.id || row.client.clientCode || row.client.name)).size;
      const filters = [
        ["conflicts",`All conflicts (${conflicts.length})`],
        ["partner",`Partner only (${conflicts.filter(row => row.area === "Partner").length})`],
        ["leadership",`Leader / Supervisor only (${conflicts.filter(row => row.area !== "Partner").length})`],
        ["review",`Needs review (${review.length})`]
      ];
      const rows = reviewFilter === "review" ? review : conflicts.filter(row =>
        reviewFilter === "conflicts" || (reviewFilter === "partner" ? row.area === "Partner" : row.area !== "Partner"));
      return `<section class="structure-review" aria-labelledby="structure-review-title">
        <div class="structure-review-head"><div><h4 id="structure-review-title">Client reporting conflicts</h4>
          <p>Compares active clients' saved owners with the Tax and Accounting PICs' reporting lines in <strong>${esc(plan.name)}</strong>. Review these before changing assignments.</p>
          <p>Leader checks use Client Master's <strong>Supervisor</strong> field. If it names a Supervisor, we compare that level, not the team leader below it.</p></div>
          <label>Show <select class="field" data-structure-review-filter>${filters.map(([value,label]) => option(value,label,reviewFilter)).join("")}</select></label>
        </div>
        <div class="structure-review-summary" role="status"><strong>${count(conflicts)} clients with conflicts</strong><span>${count(review)} need review</span><span>${rows.length} findings shown</span></div>
        ${!plan.nodes.length ? "<p>Add reporting lines to this scenario to check for mismatches. Unmatched assignments appear under Needs review.</p>" : ""}
        ${rows.length ? `<div class="table-wrap structure-review-table" tabindex="0" aria-label="Client reporting findings">
          <table><thead><tr><th scope="col">Client</th><th scope="col">Assigned PIC</th><th scope="col">Check</th><th scope="col">Client owner</th><th scope="col">PIC reports to / Finding</th></tr></thead><tbody>
          ${rows.map(row => `<tr><th scope="row">${esc(row.client.name || row.client.clientCode || "Unnamed client")}<small>${esc(row.client.clientCode)}</small></th>
            <td><strong>${esc(row.pic)}</strong><small>${esc(row.duty)}</small></td>
            <td>${esc(row.area)}</td><td>${esc(row.expected)}</td><td>${esc(row.issue || row.actual)}</td></tr>`).join("")}</tbody></table></div>`
          : "<p>No findings match this filter.</p>"}
      </section>`;
    }

    function branchesOverlap(nodes, a, b) {
      if (!a || !b) return false;
      const byId = new Map(nodes.map(node => [node.id,node]));
      const contains = (ancestor, child) => {
        for (let node = byId.get(child); node; node = byId.get(node.parent)) if (node.id === ancestor) return true;
        return false;
      };
      return contains(a,b) || contains(b,a);
    }

    function splitFor(plan) {
      if (plan.teamSplit) {
        return {a:plan.teamSplit.a || "",b:plan.teamSplit.b || "",owners:plan.teamSplit.owners || {}};
      }
      const leaders = plan.nodes.filter(node => node.kind === "Leader" || (node.kind === "Role" && people.get(node.pic)?.role === "leader"));
      if (leaders.length === 2 && !branchesOverlap(plan.nodes,leaders[0].id,leaders[1].id)) return {a:leaders[0].id,b:leaders[1].id,owners:{}};
      return {a:"",b:"",owners:{}};
    }

    function splitResult(plan) {
      const split = splitFor(plan);
      const ready = Boolean(split.a && split.b && plan.nodes.some(node => node.id === split.a) &&
        plan.nodes.some(node => node.id === split.b) && !branchesOverlap(plan.nodes,split.a,split.b));
      return {split,ready,rows:ready && clientRows ? teamSplitRows(plan,people,clientRows,split,splitMode,getAllocationDrafts()) : []};
    }

    function splitView(plan) {
      const {split,ready,rows} = splitResult(plan);
      const names = new Map(plan.nodes.map(node => [node.id,nodeName(node)]));
      const teamName = id => id === split.a ? `Team A: ${names.get(id)}` : `Team B: ${names.get(id)}`;
      const rootOptions = id => option("","Choose a branch",id) + plan.nodes.map(node => option(node.id,nodeName(node),id)).join("");
      const result = row => row.conflict ? "Outside intended team" : row.cross ? "Tax and Accounting split" :
        row.moved ? "Projected team change" : row.incomplete ? "Check PIC or chart" : "Within one team";
      const counts = {
        all:rows.length, conflicts:rows.filter(row => row.conflict || row.cross || row.moved).length,
        owners:rows.filter(row => !row.owner).length, review:rows.filter(row => row.incomplete).length
      };
      const suggested = rows.filter(row => !row.owner && row.suggested).length;
      const visible = rows.filter(row => splitFilter === "all" || (splitFilter === "conflicts" && (row.conflict || row.cross || row.moved)) ||
        (splitFilter === "owners" && !row.owner) || (splitFilter === "review" && row.incomplete));
      const picCell = item => `<td><strong>${esc(item.label)}</strong><small>${esc(item.team ? teamName(item.team) : item.assigned ? "Not mapped to either team" : "")}</small></td>`;
      return `<section class="structure-review" aria-labelledby="structure-split-title">
        <div class="structure-review-head"><div><h4 id="structure-split-title">Team Split</h4>
          <p>Compare two branches in <strong>${esc(plan.name)}</strong>. Intended teams are planning labels only and are saved in this browser.</p>
          <p>Suggestions use the Current PICs when they agree, or the only assigned PIC. Next PICs use unsaved Allocation drafts here; a role without a draft keeps its current PIC.</p>
        </div></div>
        <div class="structure-split-controls">
          <label>Team A branch <select class="field" data-structure-split="a" ${storageError ? "disabled" : ""}>${rootOptions(split.a)}</select></label>
          <label>Team B branch <select class="field" data-structure-split="b" ${storageError ? "disabled" : ""}>${rootOptions(split.b)}</select></label>
          <label>Compare <select class="field" data-structure-split="mode">${option("current","Current PICs",splitMode)}${option("next","Next PICs (Allocation drafts)",splitMode)}</select></label>
          <label>Show <select class="field" data-structure-split="filter">
            ${[["all","All active clients"],["conflicts","Conflicts & team moves"],["owners","No confirmed team"],["review","Unmapped / unassigned PICs"]].map(([key,label]) =>
              option(key,`${label} (${counts[key]})`,splitFilter)).join("")}</select></label>
          <button type="button" class="ghost-btn" data-structure-action="confirm-suggestions" ${suggested && !storageError ? "" : "disabled"}>Confirm ${suggested} suggested teams</button>
        </div>
        ${!ready ? "<p>Choose two separate leader branches to see client assignments. The branches cannot be nested.</p>"
        : !clientRows ? "<p>Waiting for confirmed Client Master data.</p>"
        : `<div class="structure-review-summary" role="status"><strong>${counts.conflicts} flagged client${counts.conflicts === 1 ? "" : "s"}</strong><span>${counts.owners} without a confirmed team</span><span>${visible.length} shown</span></div>
          ${visible.length ? `<div class="table-wrap structure-review-table" tabindex="0" aria-label="Planned team assignment findings">
            <table><thead><tr><th scope="col">Client</th><th scope="col">Intended team</th><th scope="col">Tax PIC</th><th scope="col">Accounting PIC</th><th scope="col">Finding</th></tr></thead>
            <tbody>${visible.map(row => `<tr><th scope="row">${esc(row.client.name || row.client.clientCode)}<small>${esc(row.client.clientCode)}</small></th>
              <td><div class="structure-split-owner"><select class="field" data-structure-owner aria-label="Intended team for ${esc(row.client.name)}" ${storageError ? "disabled" : ""}>
                ${option("","No confirmed team",row.owner || row.suggested)}${[split.a,split.b].map(id => option(id,teamName(id),row.owner || row.suggested)).join("")}
              </select><button type="button" class="ghost-btn" data-structure-confirm-owner="${esc(row.key)}" ${storageError ? "disabled" : ""}>Confirm</button></div>
              <small>${row.owner ? "Confirmed" : row.suggested ? "Suggested from Current PICs" : "Choose manually"}</small></td>
              ${row.shown.map(picCell).join("")}<td><span class="pill ${row.conflict || row.cross ? "warn" : "neutral"}" data-structure-split-result>${result(row)}</span></td></tr>`).join("")}</tbody></table></div>`
            : "<p>No clients match this filter.</p>"}`}
      </section>`;
    }

    function updateSplit(control) {
      const field = control.dataset.structureSplit;
      const value = control.value;
      const focus = () => host.querySelector(`[data-structure-split="${field}"]`)?.focus();
      if (field === "mode" || field === "filter") {
        if (field === "mode") splitMode = value === "next" ? "next" : "current";
        else splitFilter = ["all","conflicts","owners","review"].includes(value) ? value : "all";
        render();
        focus();
        return;
      }
      if (field !== "a" && field !== "b") return;
      const plan = active(), split = splitFor(plan);
      if (value === split[field]) return;
      if ((value && !plan.nodes.some(node => node.id === value)) ||
          branchesOverlap(plan.nodes,field === "a" ? value : split.a,field === "b" ? value : split.b)) {
        control.value = split[field];
        tell("Team A and Team B must be separate branches.");
        return;
      }
      if (Object.keys(split.owners).length && !window.confirm("Changing the team branches clears confirmed owners for this scenario. Continue?")) {
        control.value = split[field];
        return;
      }
      const draft = structuredClone(model);
      draft.plans.find(row => row.id === plan.id).teamSplit = {...split,[field]:value,owners:{}};
      if (save(draft,"Team branches saved in this browser.")) focus();
      else control.value = split[field];
    }

    function confirmTeams(button) {
      const plan = active(), {split,ready,rows} = splitResult(plan);
      if (!ready || storageError) return;
      const owners = new Map(Object.entries(split.owners));
      const key = button.dataset.structureConfirmOwner;
      if (key) {
        const row = rows.find(item => item.key === key);
        const value = button.closest("tr").querySelector("[data-structure-owner]").value;
        if (!row || (value && value !== split.a && value !== split.b)) return;
        if (value) owners.set(key,value);
        else owners.delete(key);
      } else {
        for (const row of rows) if (!row.owner && row.suggested) owners.set(row.key,row.suggested);
      }
      const draft = structuredClone(model);
      draft.plans.find(row => row.id === plan.id).teamSplit = {...split,owners:Object.fromEntries(owners)};
      if (save(draft,"Intended teams saved in this browser; live ownership is unchanged.")) {
        ([...host.querySelectorAll("[data-structure-confirm-owner]")].find(item => item.dataset.structureConfirmOwner === key) ||
          host.querySelector('[data-structure-split="filter"]'))?.focus();
      }
    }

    function render(message = storageError) {
      const plan = active(), node = plan.nodes.find(row => row.id === editing);
      const list = [...people].filter(([id]) => !usedByAnother(id));
      const oldCanvas = host.querySelector(".structure-viewport");
      if (oldCanvas) chartScroll = [oldCanvas.scrollLeft,oldCanvas.scrollTop];
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
        <div class="workspace-tabs structure-subtabs" role="group" aria-label="Structure Lab views">
          <button type="button" class="${section === "chart" ? "solid-btn" : "ghost-btn"}" data-structure-section="chart" aria-pressed="${section === "chart"}">Flowchart</button>
          <button type="button" class="${section === "conflicts" ? "solid-btn" : "ghost-btn"}" data-structure-section="conflicts" aria-pressed="${section === "conflicts"}">Conflicted Clients</button>
          <button type="button" class="${section === "split" ? "solid-btn" : "ghost-btn"}" data-structure-section="split" aria-pressed="${section === "split"}">Team Split</button>
        </div>
        <p class="subline" role="status" data-structure-status>${esc(message)}</p>
        ${section === "split" ? splitView(plan) : section === "conflicts" ? conflictView(plan) : `<div class="structure-layout">
          <section class="structure-chart" aria-label="Reporting structure">
            <header class="structure-chart-head"><div><h4>${esc(plan.name)}</h4><p>Drop a PIC or drag a card by its grip onto a manager.</p></div><div class="structure-chart-tools"><span class="pill neutral">${plan.nodes.length} position${plan.nodes.length === 1 ? "" : "s"}</span>
              <div class="structure-zoom-tools" role="group" aria-label="Chart zoom">
                <button type="button" class="ghost-btn" data-structure-zoom="out" aria-label="Zoom out">&minus;</button>
                <button type="button" class="ghost-btn structure-zoom-value" data-structure-zoom="reset" aria-label="Reset chart zoom to 100%" title="Reset zoom" ${plan.nodes.length ? "" : "disabled"}></button>
                <button type="button" class="ghost-btn" data-structure-zoom="in" aria-label="Zoom in">+</button>
                <button type="button" class="ghost-btn" data-structure-zoom="fit" ${plan.nodes.length ? "" : "disabled"}>Fit</button>
              </div></div></header>
            <div class="structure-viewport" tabindex="0" aria-label="Organization chart, scroll to see more positions">
              <button type="button" class="ghost-btn structure-top" data-structure-top ${locked} aria-disabled="${!pending}">+ Drop here for a top-level position</button>
              ${plan.nodes.length ? `<div class="structure-stage">${flow(plan.nodes)}</div>` : '<p class="structure-empty">Drag a PIC to the top-level drop zone, or add a planned position.</p>'}
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
        </div>`}`);
      if (section === "chart") {
        updateZoom();
        const canvas = host.querySelector(".structure-viewport");
        [canvas.scrollLeft,canvas.scrollTop] = chartScroll;
      }
    }

    function printSheet(plan) {
      const {points,width,height} = layout(plan.nodes);
      const cards = plan.nodes.map(node => {
        const {x,y} = points.get(node.id);
        const name = nodeName(node), detail = personName(node) ? node.label : "Unassigned / planned";
        return `<g class="structure-print-card" data-kind="${esc(node.kind)}" transform="translate(${x},${y})">
          <title>${esc(name)}: ${esc(detail)}</title>
          <rect class="structure-print-box" x=".5" y=".5" width="${cardWidth-1}" height="${cardHeight-1}" rx="9"></rect>
          <path class="structure-print-stripe" d="M 8 2 H ${cardWidth-8}"></path>
          <svg x="10" y="10" width="${cardWidth-20}" height="${cardHeight-20}">
            <text class="structure-print-kind" y="11">${esc(node.kind.toUpperCase())}</text>
            <text class="structure-print-name" y="33">${esc(name)}</text>
            <text class="structure-print-detail" y="51">${esc(detail)}</text>
          </svg></g>`;
      }).join("");
      return `<main class="structure-print-page">
        <header><small>LMATS CONSULTING / ORGANIZATION PLANNING</small><h1>${esc(plan.name)}</h1>
          <p>Planning only. Does not change system access.</p></header>
        <div class="structure-print-frame"><svg class="structure-print-diagram" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Organization flowchart">
          <g class="structure-wires">${connections(plan.nodes,points)}</g>${cards}
        </svg></div></main>`;
    }

    function print() {
      const plan = active();
      if (!plan.nodes.length) return;
      const page = window.open("", "_blank", "width=960,height=760");
      if (!page) { tell("Allow popups to print this structure."); return; }
      page.opener = null;
      const doc = page.document;
      doc.documentElement.lang = "en";
      doc.title = `Tax Dashboard | ${plan.name}`;
      const style = doc.createElement("style");
      style.textContent = `@page{size:landscape;margin:12mm}
        body{font:12px 'Segoe UI',sans-serif;color:#162b31;margin:0}
        .structure-print-page{position:fixed;inset:12mm;display:grid;grid-template-rows:auto minmax(0,1fr);print-color-adjust:exact;-webkit-print-color-adjust:exact}
        header{border-bottom:2px solid #137d80;padding-bottom:8px}h1{font-size:20px;margin:4px 0;overflow-wrap:anywhere}p{margin:4px 0 0}
        .structure-print-frame{min-width:0;min-height:0}
        .structure-print-diagram{display:block;width:100%;height:100%}
        .structure-wires{fill:none;stroke:#137d80;stroke-width:1.6}
        .structure-print-box{fill:#fff;stroke:#c5d6ce}
        .structure-print-stripe{fill:none;stroke:#137d80;stroke-width:3}
        .structure-print-card[data-kind="Partner"] .structure-print-box{fill:#e7f4f3}
        .structure-print-card[data-kind="Team"] .structure-print-stripe{stroke:#b76a0a}
        .structure-print-card svg{overflow:hidden}
        .structure-print-kind{fill:#166b69;font-size:9px;letter-spacing:1px}
        .structure-print-name{fill:#162b31;font-weight:700;font-size:14px}
        .structure-print-detail{fill:#506268;font-size:11px}
        @media print{.structure-print-page{inset:0}}`;
      doc.head.append(style);
      const printable = document.createElement("template");
      printable.innerHTML = safeHtml(printSheet(plan));
      doc.body.append(doc.importNode(printable.content, true));
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
      if (["chart","conflicts","split"].includes(button.dataset.structureSection)) {
        section = button.dataset.structureSection;
        clearDrag();
        pending = null;
        render();
        host.querySelector(`[data-structure-section="${section}"]`).focus();
        return;
      }
      if (section === "split" && (button.dataset.structureConfirmOwner || button.dataset.structureAction === "confirm-suggestions")) {
        confirmTeams(button);
        return;
      }
      if (button.dataset.structureZoom) { changeZoom(button.dataset.structureZoom); return; }
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
        const split = plan.teamSplit;
        const removesBranch = node && split && [split.a,split.b].includes(node.id);
        if (!node || !window.confirm(`Remove "${node.label}"? Direct reports will move up one level.${removesBranch ? " This also clears the removed Team Split branch and its confirmed ownership plan." : ""}`)) return;
        if (removesBranch) plan.teamSplit = {...split,a:split.a === node.id ? "" : split.a,b:split.b === node.id ? "" : split.b,owners:{}};
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

    function mount(target, staff, nextClients = null) {
      if (!canManage()) return;
      const roster = staff.filter(person => person.directory_active !== false && person.id && (person.display_name || person.full_name))
        .map(person => {
          const role = String(person.role || "staff").toLowerCase();
          const roleLabel = Object.hasOwn(roleLabels,role) ? roleLabels[role] : "PIC";
          return [person.id,{name:person.display_name || person.full_name,fullName:person.full_name,role,roleLabel,
            title:person.employment_title || roleLabel,kind:ownerRoles.includes(role) ? roleLabel : "Role"}];
        }).sort((a,b) => a[1].name.localeCompare(b[1].name));
      const signature = JSON.stringify(roster);
      const clientsChanged = nextClients !== clientRows;
      clientRows = nextClients;
      if (target === host && signature === rosterKey && section !== "split" && (!clientsChanged || section === "chart")) return;
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
          if (!canManage()) return;
          if (event.target.matches("[data-structure-split]")) {
            updateSplit(event.target);
            return;
          }
          if (event.target.matches("[data-structure-review-filter]")) {
            reviewFilter = event.target.value;
            render();
            host.querySelector("[data-structure-review-filter]").focus();
            return;
          }
          if (!event.target.matches("[data-structure-plan]")) return;
          if (!model.plans.some(plan => plan.id === event.target.value) ||
              !save({...model, active: event.target.value}, "Scenario selected.", true)) event.target.value = model.active;
        });
      }
      rosterKey = signature;
      people = new Map(roster);
      render();
    }
    function refreshClients(nextClients) {
      if (!canManage()) return;
      clientRows = nextClients;
      if (section !== "chart" && host?.isConnected) render();
    }
    return { mount,refreshClients };
  }
  window.ManagementStructure = { create };
})();
