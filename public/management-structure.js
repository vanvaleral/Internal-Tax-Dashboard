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
  const allocationRoles = [["Tax PIC","tax team"],["Accounting PIC","accounting team"]];
  const teamSlots = ["a","b","c"];
  const teamLabel = slot => `Team ${slot.toUpperCase()}`;
  const selectedTeams = split => teamSlots.filter(slot => split[slot]).map(slot => ({slot,id:split[slot],label:teamLabel(slot)}));
  const flagged = row => row.conflict || row.cross || row.moved;
  const finding = row => row.conflict ? "Outside intended team" : row.cross ? "Tax and Accounting split" :
    row.moved ? "Projected team change" : row.incomplete ? "Check PIC or chart" : "Within one team";
  const splitColumns = {client:"Client",team:"Intended team",tax:"Tax PIC",accounting:"Accounting PIC",finding:"Finding"};
  const loadGapLimit = 20;

  function splitColumnValue(row, column, teamNames) {
    if (column === "client") {
      const {name,clientCode} = row.client;
      return [row.key,[name,clientCode].filter(Boolean).join(" / ") || row.key];
    }
    if (column === "team") {
      const id = row.owner || row.suggested;
      return [id || "",teamNames.get(id) || "No confirmed team"];
    }
    if (column === "finding") return [finding(row),finding(row)];
    const pic = row.shown[column === "tax" ? 0 : 1];
    return [pic.id ? `id:${pic.id}` : pic.assigned ? `name:${nameKey(pic.label)}` : "",pic.label];
  }

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

  const clientKey = client => String(client.databaseId || client.id || "");
  function teamSplitRows(plan, people, clients, split, teams, mode, drafts, recommend) {
    const resolve = resolveStaff(people);
    const byId = new Map(plan.nodes.map(node => [node.id,node]));
    const teamIds = new Set(teams.map(team => team.id));
    const memberships = new Map();
    const plannedPartners = new Set();
    for (const position of plan.nodes) {
      const kind = nameKey(position.kind);
      const id = position.pic || (ownerRoles.includes(kind) ? resolve(["",position.label]) : "");
      if (!id) continue;
      if (kind === "partner" || position.id === split.c) plannedPartners.add(id);
      let node = position;
      // A supervisor branch can contain A or B; the nearest selected root owns the position.
      while (node && !teamIds.has(node.id)) node = byId.get(node.parent);
      if (!memberships.has(id)) memberships.set(id,new Set());
      memberships.get(id).add(node?.id || "");
    }
    const teamOf = id => memberships.get(id)?.size === 1 ? memberships.get(id).values().next().value : "";
    const project = (client, next) => ["tax","accounting"].map(role => {
      const current = assignment(client,role);
      const proposed = next ? drafts[client.id]?.[role === "tax" ? "nextTaxPic" : "nextAccPic"] : null;
      const before = resolve(current);
      // Allocation initializes both draft fields. Preserve the current stable ID when a copied label is unchanged.
      const label = proposed ?? (people.get(before)?.name || current[1] || "");
      const assigned = proposed != null ? Boolean(nameKey(proposed)) : Boolean(current[0] || nameKey(current[1]));
      const same = proposed == null || [current[1],people.get(before)?.name].some(name => nameKey(name) === nameKey(proposed));
      const id = assigned ? (same ? before : resolve(["",proposed])) : "";
      return {id,assigned,label:assigned ? (people.get(id)?.name || label || "Unlisted PIC") : "Unassigned",team:teamOf(id)};
    });
    const ownerSuggestion = assignments => {
      const assigned = assignments.filter(item => item.assigned);
      return assigned.length && assigned[0].team && assigned.every(item => item.team === assigned[0].team) ? assigned[0].team : "";
    };
    const rows = clients.filter(client => nameKey(client.clientStatus) === "active" && clientKey(client)).map(client => {
      const current = project(client,false);
      const shown = mode === "next" ? project(client,true) : current;
      const key = clientKey(client);
      const stored = Object.hasOwn(split.owners,key) ? split.owners[key] : "";
      const owner = teamIds.has(stored) ? stored : "";
      const suggested = ownerSuggestion(current);
      const assigned = shown.filter(item => item.assigned);
      const teams = new Set(assigned.map(item => item.team).filter(Boolean));
      const conflict = Boolean(owner && [...teams].some(team => team !== owner));
      const cross = teams.size > 1;
      const incomplete = !assigned.length || assigned.some(item => !item.team);
      const projectedTeam = ownerSuggestion(shown);
      const moved = !owner && mode === "next" && !!suggested && !!projectedTeam && suggested !== projectedTeam;
      return {client,key,shown,owner,suggested,conflict,cross,incomplete,moved};
    }).sort((a,b) => String(a.client.name || "").localeCompare(String(b.client.name || "")) || a.key.localeCompare(b.key));
    if (recommend) suggestTeamPics(rows,people,teamOf,plannedPartners,resolve);
    return rows;
  }

  function teamClientLoad({teams:selected,rows}) {
    const teams = selected.map(team => ({...team,total:0,tax:0,accounting:0,flagged:0}));
    let shared = 0, unmapped = 0;
    for (const row of rows) {
      const [tax,accounting] = row.shown;
      const mapped = teams.filter(team => team.id === tax.team || team.id === accounting.team);
      if (!mapped.length) unmapped++;
      if (mapped.length > 1) shared++;
      for (const team of teams) {
        if (flagged(row) && (mapped.includes(team) || row.owner === team.id || (row.moved && row.suggested === team.id))) team.flagged++;
        if (!mapped.includes(team)) continue;
        team.total++;
        if (team.id === tax.team) team.tax++;
        if (team.id === accounting.team) team.accounting++;
      }
    }
    const combined = teams.reduce((sum,team) => sum + team.total,0);
    const highest = Math.max(...teams.map(team => team.total)), lowest = Math.min(...teams.map(team => team.total));
    const uneven = 100 * (highest - lowest) > loadGapLimit * combined;
    const busiest = teams.filter(team => team.total === highest);
    return {teams,shared,unmapped,combined,uneven,leader:busiest.length === 1 ? busiest[0] : null};
  }

  function suggestTeamPics(rows, people, teamOf, plannedPartners, resolve) {
    const eligible = allocationRoles.map(([,division]) => [...people].filter(([id,person]) =>
      person.division === division && person.role !== "partner" && !plannedPartners.has(id) &&
      teamOf(id) && resolve(["",person.name]) === id));
    const counts = allocationRoles.map(() => new Map());
    const queue = [];
    // Count retained work first, so the estimate does not burden someone with assignments this plan would move away.
    for (const row of rows) {
      row.recommendations = [];
      row.shown.forEach((item,index) => {
        const replace = Boolean(row.owner && item.assigned && item.team && item.team !== row.owner);
        const candidates = replace ? eligible[index].filter(([id]) => teamOf(id) === row.owner) : [];
        if (candidates.length) queue.push({row,item,index,candidates});
        else {
          if (item.id) counts[index].set(item.id,(counts[index].get(item.id) || 0)+1);
          if (replace) row.recommendations.push({role:allocationRoles[index][0], note:`No eligible ${allocationRoles[index][0]} in the intended team.`});
        }
      });
    }
    for (const {row,item,index,candidates} of queue) {
      const load = counts[index], count = id => load.get(id) || 0;
      const [id,person] = candidates.reduce((least,entry) => count(entry[0]) < count(least[0]) ? entry : least);
      load.set(id,count(id)+1);
      row.recommendations.push({role:allocationRoles[index][0],from:item.label,to:person.name});
    }
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
    let clientRows = null, section = "chart", chartScroll = [0,0];
    let splitMode = "current", splitFilter = "all", showRecommendations = false;
    const columnFilters = new Map();
    let columnSource, columnMenu;
    try {
      baseline = localStorage.getItem(key);
      if (baseline) {
        // Keep the last active chart and leave older saved plans intact.
        const stored = JSON.parse(baseline);
        if (!Array.isArray(stored.plans) || !stored.plans.length || stored.plans.length > maxPlans ||
            !stored.plans.some(plan => plan.id === stored.active) ||
            !stored.plans.every(plan => Array.isArray(plan.nodes) && plan.nodes.length <= maxNodes && validate(plan.nodes))) {
          throw new Error("Invalid structure");
        }
        model = stored;
      }
    } catch {
      storageError = "The saved structure could not be read. Reload before editing.";
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
        return {a:plan.teamSplit.a || "",b:plan.teamSplit.b || "",c:plan.teamSplit.c || "",owners:plan.teamSplit.owners || {}};
      }
      const leaders = plan.nodes.filter(node => node.kind === "Leader" || (node.kind === "Role" && people.get(node.pic)?.role === "leader"));
      if (leaders.length === 2 && !branchesOverlap(plan.nodes,leaders[0].id,leaders[1].id)) return {a:leaders[0].id,b:leaders[1].id,c:"",owners:{}};
      return {a:"",b:"",c:"",owners:{}};
    }

    function splitResult(plan, mode, recommend) {
      const split = splitFor(plan);
      const teams = selectedTeams(split);
      const ready = Boolean(split.a && split.b && new Set(teams.map(team => team.id)).size === teams.length &&
        teams.every(team => plan.nodes.some(node => node.id === team.id)) && !branchesOverlap(plan.nodes,split.a,split.b));
      return {split,teams,mode,ready,rows:ready && clientRows ? teamSplitRows(plan,people,clientRows,split,teams,mode,mode === "next" ? getAllocationDrafts() : {},recommend) : []};
    }

    function clientLoadSummary(plan, comparison, heading = "h4") {
      const next = comparison.mode === "next";
      const title = next ? "Forecast team client load" : "Current team client load";
      const compare = heading === "h4" ? `<select class="field" data-structure-split="mode" aria-label="Compare team client load">
        ${option("current","Current PICs",comparison.mode)}${option("next","Next PICs (Allocation drafts)",comparison.mode)}</select>` : "";
      const headingHtml = `<${heading} id="structure-load-title">${title}</${heading}>`;
      if (!comparison.ready || !clientRows) {
        const hint = comparison.ready ? "Waiting for confirmed Client Master data." : "Choose Team A and B in Team Split to compare their client load. Team C is optional.";
        return `<section class="structure-load" aria-labelledby="structure-load-title">
          <div class="structure-load-heading">${headingHtml}${compare}</div><p>${hint}</p></section>`;
      }
      const {teams,shared,unmapped,combined,uneven,leader} = teamClientLoad(comparison);
      const names = new Map(plan.nodes.map(node => [node.id,nodeName(node)]));
      const status = !combined ? "No clients mapped" : !uneven ? "Balanced by client count"
        : leader ? `Uneven: ${leader.label} has more clients` : "Uneven by client count";
      return `<section class="structure-load" aria-labelledby="structure-load-title">
        <div class="structure-load-heading">${headingHtml}<div class="structure-load-controls">
          <span class="pill ${uneven ? "warn" : "neutral"}" data-structure-load-status>${status}</span>${compare}</div></div>
        <div class="structure-load-teams">${teams.map(team => `<div class="structure-load-team" data-structure-load-team="${team.slot}">
          <div><strong>${team.label}: ${esc(names.get(team.id))}</strong><small>Tax: ${team.tax} &middot; Accounting: ${team.accounting} &middot; <strong class="${team.flagged ? "structure-load-flagged" : ""}">${team.flagged} flagged</strong></small></div>
          <span><strong data-structure-load-count>${team.total}</strong> client${team.total === 1 ? "" : "s"}</span></div>`).join("")}</div>
        <p><strong>${shared} shared</strong> (counted once per involved team) &middot; <strong>${unmapped} with no PIC mapped to any team.</strong>
          Uneven when team shares differ by more than ${loadGapLimit} percentage points. Client counts do not account for difficulty or staffing.
          ${next ? "Forecast uses unsaved Allocation drafts and keeps saved PICs where there is no draft." : ""}</p>
      </section>`;
    }

    function refreshLoadSummary() {
      const slot = host.querySelector("[data-structure-load]");
      const plan = active();
      if (slot) slot.innerHTML = safeHtml(clientLoadSummary(plan,splitResult(plan,splitMode,false)));
    }

    function columnHeading(column,label) {
      const active = columnFilters.has(column);
      return `<th scope="col"><button type="button" class="structure-column-toggle${active ? " is-filtered" : ""}"
        data-structure-column="${column}" aria-haspopup="dialog" aria-expanded="false" aria-label="Filter by ${label}${active ? " (active)" : ""}">
        ${label}<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2.5 3.5h11L9.5 8v3.5l-3 1V8z" fill="none" stroke="currentColor" stroke-linejoin="round"></path></svg>
      </button></th>`;
    }

    function closeColumnMenu(restoreFocus = false) {
      if (!columnMenu) return;
      const {panel,trigger,events} = columnMenu;
      columnMenu = null;
      events.abort();
      panel.remove();
      trigger.setAttribute("aria-expanded","false");
      trigger.removeAttribute("aria-controls");
      trigger.removeAttribute("popovertarget");
      if (restoreFocus) trigger.focus({preventScroll:true});
    }

    function openColumnMenu(trigger) {
      const column = trigger.dataset.structureColumn;
      if (!columnSource || !Object.hasOwn(splitColumns,column)) return;
      const wasOpen = columnMenu?.trigger === trigger;
      closeColumnMenu();
      if (wasOpen) return;
      const {rows,teamNames} = columnSource;
      const choices = [...new Map(rows.map(row => splitColumnValue(row,column,teamNames)))]
        .sort((a,b) => a[1].localeCompare(b[1],undefined,{numeric:true,sensitivity:"base"}));
      const applied = columnFilters.get(column), label = splitColumns[column];
      const panel = document.createElement("div");
      panel.id = "structure-column-filter";
      panel.className = "structure-column-menu";
      panel.setAttribute("role","dialog");
      panel.setAttribute("aria-label",`Filter by ${label}`);
      panel.innerHTML = safeHtml(`<form class="structure-column-form">
        <strong>Filter by ${label}</strong>
        <input type="search" class="field" data-column-query aria-label="Search ${label} values" placeholder="Search values">
        <label class="structure-column-check"><input type="checkbox" data-column-all> Select all shown</label>
        <div class="structure-column-options">
          ${choices.map(([key,text]) => `<label class="structure-column-check" data-column-option>
            <input type="checkbox" value="${esc(key)}" ${!applied || applied.has(key) ? "checked" : ""}> <span>${esc(text)}</span>
          </label>`).join("")}
          <p data-column-empty hidden>No matching values.</p>
        </div>
        <div class="structure-column-footer">
          <button type="button" class="ghost-btn" data-column-clear ${applied ? "" : "disabled"}>Clear filter</button>
          <button type="button" class="ghost-btn" data-column-cancel>Cancel</button>
          <button type="submit" class="solid-btn">Apply</button>
        </div>
      </form>`);
      const search = panel.querySelector("[data-column-query]"), all = panel.querySelector("[data-column-all]");
      const entries = [...panel.querySelectorAll("[data-column-option]")].map(entry => ({
        entry, box:entry.querySelector("input"), text:nameKey(entry.textContent)
      }));
      const shown = () => entries.filter(item => !item.entry.hidden);
      function updateCheckAll() {
        const items = shown(), checked = items.filter(item => item.box.checked).length;
        all.disabled = !items.length;
        all.checked = !!items.length && checked === items.length;
        all.indeterminate = checked > 0 && checked < items.length;
        panel.querySelector("[data-column-empty]").hidden = !!items.length;
      }
      search.addEventListener("input",() => {
        const query = nameKey(search.value);
        for (const item of entries) item.entry.hidden = !item.text.includes(query);
        updateCheckAll();
      });
      panel.addEventListener("change",event => {
        if (event.target === all) for (const {box} of shown()) box.checked = all.checked;
        updateCheckAll();
      });
      function apply(selection) {
        if (selection) columnFilters.set(column,selection);
        else columnFilters.delete(column);
        render();
        host.querySelector(`[data-structure-column="${column}"]`)?.focus({preventScroll:true});
      }
      panel.querySelector("form").addEventListener("submit",event => {
        event.preventDefault();
        const selection = new Set(entries.filter(({box}) => box.checked).map(({box}) => box.value));
        apply(selection.size === entries.length ? null : selection);
      });
      panel.querySelector("[data-column-clear]").addEventListener("click",() => apply(null));
      panel.querySelector("[data-column-cancel]").addEventListener("click",() => closeColumnMenu(true));
      updateCheckAll();

      // The menu lives outside the scroll container so sticky headers do not clip it.
      const events = new AbortController(), signal = events.signal;
      const anchor = trigger.getBoundingClientRect();
      columnMenu = {panel,trigger,events};
      trigger.setAttribute("aria-expanded","true");
      trigger.setAttribute("aria-controls",panel.id);
      if (typeof panel.showPopover === "function") {
        panel.setAttribute("popover","auto");
        trigger.setAttribute("popovertarget",panel.id);
        panel.addEventListener("toggle",event => {
          if (event.newState === "closed" && columnMenu?.panel === panel) closeColumnMenu();
        });
      } else {
        document.addEventListener("pointerdown",event => {
          if (!panel.contains(event.target) && !trigger.contains(event.target)) closeColumnMenu();
        },{signal});
      }
      host.append(panel);
      if (panel.hasAttribute("popover")) panel.showPopover();
      const width = document.documentElement.clientWidth || window.innerWidth;
      const height = document.documentElement.clientHeight || window.innerHeight;
      const below = anchor.bottom + 6;
      panel.style.left = `${Math.max(8,Math.min(anchor.left,width - panel.offsetWidth - 8))}px`;
      panel.style.top = `${below + panel.offsetHeight <= height - 8 ? below : Math.max(8,anchor.top - panel.offsetHeight - 6)}px`;
      search.focus({preventScroll:true});
      document.addEventListener("keydown",event => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        closeColumnMenu(true);
      },{signal});
      document.addEventListener("scroll",event => {
        if (!panel.contains(event.target)) closeColumnMenu();
      },{capture:true,passive:true,signal});
      window.addEventListener("resize",() => closeColumnMenu(),{signal});
    }

    function splitView(plan, {split,teams,ready,rows}) {
      const names = new Map(plan.nodes.map(node => [node.id,nodeName(node)]));
      const teamName = team => `${team.label}: ${names.get(team.id)}`;
      const teamNames = new Map(teams.map(team => [team.id,teamName(team)]));
      columnSource = ready && clientRows ? {rows,teamNames} : null;
      const rootOptions = slot => option("",slot === "c" ? "No Team C" : "Choose a branch",split[slot]) +
        plan.nodes.map(node => option(node.id,nodeName(node),split[slot])).join("");
      const counts = {
        all:rows.length, conflicts:rows.filter(flagged).length,
        owners:rows.filter(row => !row.owner).length, review:rows.filter(row => row.incomplete).length
      };
      const suggested = rows.filter(row => !row.owner && row.suggested).length;
      const proposed = rows.reduce((total,row) => total + (row.recommendations?.filter(item => item.to).length || 0),0);
      const activeColumns = [...columnFilters];
      const visible = rows.filter(row => (splitFilter === "all" || (splitFilter === "conflicts" && flagged(row)) ||
        (splitFilter === "owners" && !row.owner) || (splitFilter === "review" && row.incomplete)) &&
        activeColumns.every(([column,allowed]) => allowed.has(splitColumnValue(row,column,teamNames)[0])));
      const picCell = item => `<td><strong>${esc(item.label)}</strong><small>${esc(item.team ? teamNames.get(item.team) : item.assigned ? "Not mapped to a team" : "")}</small></td>`;
      const recommendationCell = row => `<td data-structure-recommendation>${row.recommendations.length
        ? row.recommendations.map(item => `<div><strong>${esc(item.role)}</strong>: ${item.to ? `${esc(item.from)} &rarr; ${esc(item.to)}` : esc(item.note)}</div>`).join("")
        : !row.owner ? "Confirm an intended team first." : row.incomplete ? "Review unassigned or unmapped PICs." : "Keep existing PICs."}
        ${row.recommendations.length && row.incomplete ? "<small>Also review unassigned or unmapped PICs.</small>" : ""}</td>`;
      return `<section class="structure-review" aria-labelledby="structure-split-title">
        <div class="structure-review-head"><div><h4 id="structure-split-title">Team Split</h4>
          <p>Compare up to three branches in <strong>${esc(plan.name)}</strong>. Intended teams are planning labels only and are saved in this browser.</p>
          <p>Choose the current supervisor's branch for Team C. Where branches are nested, each PIC belongs to the closest selected team. Suggestions use saved Current PICs.</p>
        </div></div>
        <div class="structure-split-controls">
          ${teamSlots.map(slot => `<label>${teamLabel(slot)} ${slot === "c" ? "(incoming partner)" : "branch"}
            <select class="field" data-structure-split="${slot}" ${storageError ? "disabled" : ""}>${rootOptions(slot)}</select></label>`).join("")}
          <label>Show <select class="field" data-structure-split="filter">
            ${[["all","All active clients"],["conflicts","Conflicts & team moves"],["owners","No confirmed team"],["review","Unmapped / unassigned PICs"]].map(([key,label]) =>
              option(key,`${label} (${counts[key]})`,splitFilter)).join("")}</select></label>
          <button type="button" class="ghost-btn" data-structure-action="confirm-suggestions" ${suggested && !storageError ? "" : "disabled"}>Confirm ${suggested} suggested teams</button>
          <button type="button" class="ghost-btn" data-structure-action="recommend-pics" aria-pressed="${showRecommendations}" ${ready && clientRows ? "" : "disabled"}>${showRecommendations ? "Hide PIC recommendations" : "Recommend PIC changes"}</button>
        </div>
        ${showRecommendations && ready && clientRows ? `<p class="subline">${proposed} proposed PIC change${proposed === 1 ? "" : "s"} across all active clients. Replacements stay in the intended team and go to the eligible PIC with the fewest clients for that role. Preview only; Allocation is unchanged.</p>` : ""}
        ${!ready ? "<p>Choose separate branches for Teams A and B. Team C is optional and must use a different position.</p>"
        : !clientRows ? "<p>Waiting for confirmed Client Master data.</p>"
        : `<div class="structure-review-summary"><div role="status"><strong>${counts.conflicts} flagged client${counts.conflicts === 1 ? "" : "s"}</strong><span>${counts.owners} without a confirmed team</span><span>${visible.length} shown</span></div>
          ${activeColumns.length ? '<button type="button" class="ghost-btn" data-structure-action="clear-column-filters">Clear column filters</button>' : ""}</div>
          <div class="table-wrap structure-review-table" tabindex="0" aria-label="Planned team assignment findings">
            <table><thead><tr>${Object.entries(splitColumns).map(([column,label]) => columnHeading(column,label)).join("")}${showRecommendations ? '<th scope="col">Recommendation</th>' : ""}</tr></thead>
            <tbody>${visible.map(row => `<tr><th scope="row">${esc(row.client.name || row.client.clientCode)}<small>${esc(row.client.clientCode)}</small></th>
              <td><div class="structure-split-owner"><select class="field" data-structure-owner aria-label="Intended team for ${esc(row.client.name)}" ${storageError ? "disabled" : ""}>
                ${option("","No confirmed team",row.owner || row.suggested)}${teams.map(team => option(team.id,teamName(team),row.owner || row.suggested)).join("")}
              </select><button type="button" class="ghost-btn" data-structure-confirm-owner="${esc(row.key)}" ${storageError ? "disabled" : ""}>Confirm</button></div>
              ${row.owner ? "<small>Confirmed</small>" : ""}</td>
              ${row.shown.map(picCell).join("")}<td><span class="pill ${flagged(row) ? "warn" : "neutral"}" data-structure-split-result>${finding(row)}</span></td>
              ${showRecommendations ? recommendationCell(row) : ""}</tr>`).join("") || `<tr><td colspan="${showRecommendations ? 6 : 5}">No clients match these filters.</td></tr>`}</tbody></table></div>`}
      </section>`;
    }

    function updateSplit(control) {
      const field = control.dataset.structureSplit;
      const value = control.value;
      const focus = () => host.querySelector(`[data-structure-split="${field}"]`)?.focus();
      if (field === "mode" || field === "filter") {
        if (field === "mode") {
          splitMode = value === "next" ? "next" : "current";
          if (section === "chart") refreshLoadSummary();
          else render();
        } else {
          splitFilter = ["all","conflicts","owners","review"].includes(value) ? value : "all";
          render();
        }
        focus();
        return;
      }
      if (!teamSlots.includes(field)) return;
      const plan = active(), split = splitFor(plan);
      if (value === split[field]) return;
      const updated = {...split,[field]:value};
      if ((value && !plan.nodes.some(node => node.id === value)) ||
          (value && teamSlots.some(slot => slot !== field && split[slot] === value)) ||
          branchesOverlap(plan.nodes,updated.a,updated.b)) {
        control.value = split[field];
        tell("Team A and Team B must be separate branches. Team C must use a distinct position.");
        return;
      }
      const owners = field === "c" ? Object.fromEntries(Object.entries(split.owners).filter(([,id]) => id !== split.c)) : {};
      if (Object.keys(owners).length !== Object.keys(split.owners).length &&
          !window.confirm("Changing this branch clears affected confirmed teams. Continue?")) {
        control.value = split[field];
        return;
      }
      const draft = structuredClone(model);
      draft.plans.find(row => row.id === plan.id).teamSplit = {...updated,owners};
      if (save(draft,"Team branches saved in this browser.")) focus();
      else control.value = split[field];
    }

    function confirmTeams(button) {
      const plan = active(), {split,teams,ready,rows} = splitResult(plan,splitMode,false);
      if (!ready || storageError) return;
      const owners = new Map(Object.entries(split.owners));
      const key = button.dataset.structureConfirmOwner;
      if (key) {
        const row = rows.find(item => item.key === key);
        const value = button.closest("tr").querySelector("[data-structure-owner]").value;
        if (!row || (value && !teams.some(team => team.id === value))) return;
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
      closeColumnMenu();
      const plan = active(), node = plan.nodes.find(row => row.id === editing);
      const list = [...people].filter(([id]) => !usedByAnother(id));
      const oldCanvas = host.querySelector(".structure-viewport");
      if (oldCanvas) chartScroll = [oldCanvas.scrollLeft,oldCanvas.scrollTop];
      const oldTable = host.querySelector(".structure-review-table");
      const tableScroll = oldTable ? [oldTable.scrollLeft,oldTable.scrollTop] : null;
      const parentOptions = plan.nodes.filter(row => !node || (row.id !== node.id &&
        validate(plan.nodes.map(entry => entry.id === node.id ? {...entry, parent: row.id} : entry))));
      const locked = storageError ? "disabled" : "";
      const comparison = splitResult(plan,splitMode,section === "split" && showRecommendations);
      host.innerHTML = safeHtml(`
        <div class="section-title"><div><div class="eyebrow">Organization planning</div><h3>Structure Lab</h3><p>Plan reporting lines without changing live assignments or access. This chart stays in this browser.</p></div>
          <button type="button" class="ghost-btn" data-structure-action="print" title="Print the flowchart, client load and flagged clients when Team Split is ready" ${plan.nodes.length ? "" : "disabled"}>Print</button></div>
        <div data-structure-load>${clientLoadSummary(plan,comparison)}</div>
        <div class="workspace-tabs structure-subtabs" role="group" aria-label="Structure Lab views">
          <button type="button" class="${section === "chart" ? "solid-btn" : "ghost-btn"}" data-structure-section="chart" aria-pressed="${section === "chart"}">Flowchart</button>
          <button type="button" class="${section === "split" ? "solid-btn" : "ghost-btn"}" data-structure-section="split" aria-pressed="${section === "split"}">Team Split</button>
        </div>
        <p class="subline" role="status" data-structure-status>${esc(message)}</p>
        ${section === "split" ? splitView(plan,comparison) : `<div class="structure-layout">
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
      } else if (tableScroll) {
        const table = host.querySelector(".structure-review-table");
        if (table) [table.scrollLeft,table.scrollTop] = tableScroll;
      }
    }

    function printSheet(plan, report) {
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
          <p>Planning only. Does not change system access.</p>
          ${report ? clientLoadSummary(plan,report,"h2") : ""}</header>
        <div class="structure-print-frame"><svg class="structure-print-diagram" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Organization flowchart">
          <g class="structure-wires">${connections(plan.nodes,points)}</g>${cards}
        </svg></div></main>`;
    }

    function printFindings(plan, {teams,mode,rows}) {
      const flaggedRows = rows.filter(flagged);
      const unmapped = rows.filter(row => row.incomplete).length;
      const names = new Map(plan.nodes.map(node => [node.id,nodeName(node)]));
      const labels = new Map(teams.map(team => [team.id,team.label]));
      const next = mode === "next";
      const pic = item => `<td><strong>${esc(item.label)}</strong>${item.assigned ? `<small>${labels.get(item.team) || "Not mapped to a team"}</small>` : ""}</td>`;
      return `<section class="structure-print-findings" aria-labelledby="structure-print-findings-title">
        <header><small>LMATS CONSULTING / TEAM SPLIT REPORT</small>
          <h2 id="structure-print-findings-title">Flagged clients: ${next ? "Next PICs (draft forecast)" : "Current PICs"}</h2>
          <p><strong>${esc(plan.name)}</strong> &middot; ${teams.map(team => `${team.label}: ${esc(names.get(team.id))}`).join(" &middot; ")}</p>
          <p>${flaggedRows.length} of ${rows.length} active clients flagged. ${next ? "Unsaved Allocation drafts; roles without drafts use saved Current PICs." : "This comparison uses saved Current PICs only."}</p>
          ${unmapped ? `<p>Unassigned or unmapped PICs to review: ${unmapped} active client${unmapped === 1 ? "" : "s"}.</p>` : ""}
        </header>
        ${flaggedRows.length ? `<table aria-label="Flagged active clients">
          <colgroup><col style="width:26%"><col style="width:17%"><col style="width:18%"><col style="width:18%"><col style="width:21%"></colgroup>
          <thead><tr><th scope="col">Client</th><th scope="col">Intended team</th><th scope="col">Tax PIC</th><th scope="col">Accounting PIC</th><th scope="col">Reason flagged</th></tr></thead>
          <tbody>${flaggedRows.map(row => `<tr><th scope="row">${esc(row.client.name || row.client.clientCode)}<small>${esc(row.client.clientCode)}</small></th>
            <td>${labels.get(row.owner) || "Not confirmed"}</td>${row.shown.map(pic).join("")}
            <td>${[row.conflict ? "PIC outside intended team" : "",row.cross ? "Tax and Accounting split" : "",row.moved ? "Projected team change" : ""].filter(Boolean).join("; ")}</td></tr>`).join("")}</tbody></table>`
          : `<p>No ${next ? "forecast" : "current"} client conflicts were found for these branches.</p>`}
      </section>`;
    }

    function print() {
      const plan = active();
      if (!plan.nodes.length) return;
      const split = clientRows ? splitResult(plan,splitMode,false) : null;
      const report = split?.ready ? split : null;
      const page = window.open("", "_blank", "width=960,height=760");
      if (!page) { tell("Allow popups to print this structure."); return; }
      page.opener = null;
      const doc = page.document;
      doc.documentElement.lang = "en";
      doc.title = `Tax Dashboard | ${plan.name}${report ? " | Team Split Report" : ""}`;
      if (report) doc.body.classList.add("structure-print-report");
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
        .structure-print-report .structure-print-page{position:static;block-size:min(170mm,calc(100vh - 8mm));break-inside:avoid;break-after:page}
        .structure-print-report .structure-print-page,.structure-print-findings{margin:0 auto;max-width:275mm;padding:10px;box-sizing:border-box}
        .structure-load{border:1px solid #c5d6ce;border-radius:6px;margin-top:8px;padding:6px 8px;font-size:10px}
        .structure-load-heading,.structure-load-team{display:flex;align-items:baseline;justify-content:space-between;gap:6px;overflow-wrap:anywhere}
        .structure-load h2{font-size:12px;margin:0}
        .structure-load .warn{color:#8b4e10;font-weight:700}
        .structure-load-teams{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:8px;margin-top:4px}
        .structure-load-team{background:#edf4f1;padding:4px 6px}
        .structure-load-team small{display:block}
        .structure-load-team span{flex:none}
        .structure-print-findings header{break-after:avoid}
        .structure-print-findings h2{font-size:19px;margin:5px 0}
        .structure-print-findings table{width:100%;margin-top:12px;border-collapse:collapse;table-layout:fixed}
        .structure-print-findings thead{display:table-header-group;break-inside:avoid;background:#e7f4f3}
        .structure-print-findings tr{break-inside:avoid;page-break-inside:avoid}
        .structure-print-findings th,.structure-print-findings td{padding:6px 7px;border:1px solid #c5d6ce;text-align:left;vertical-align:top;overflow-wrap:anywhere}
        .structure-print-findings table small{display:block;color:#506268}
        @media print{.structure-print-page{inset:0}}
        @media print{.structure-print-report .structure-print-page,.structure-print-findings{padding:0}}`;
      doc.head.append(style);
      const printable = document.createElement("template");
      printable.innerHTML = safeHtml(printSheet(plan,report) + (report ? printFindings(plan,report) : ""));
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
      if (section === "split" && button.dataset.structureColumn) {
        event.preventDefault();
        openColumnMenu(button);
        return;
      }
      if (section === "split" && button.dataset.structureAction === "clear-column-filters") {
        columnFilters.clear();
        render();
        host.querySelector("[data-structure-column]")?.focus();
        return;
      }
      if (["chart","split"].includes(button.dataset.structureSection)) {
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
      if (section === "split" && button.dataset.structureAction === "recommend-pics") {
        showRecommendations = !showRecommendations;
        render();
        host.querySelector('[data-structure-action="recommend-pics"]').focus();
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
      if (action !== "remove") return;
      const draft = structuredClone(model), plan = draft.plans.find(item => item.id === draft.active);
      const node = plan.nodes.find(item => item.id === editing);
      const split = plan.teamSplit;
      const removedSlot = node && split && teamSlots.find(slot => split[slot] === node.id);
      if (!node || !window.confirm(`Remove "${node.label}"? Direct reports will move up one level.${removedSlot ? " This also clears the removed Team Split branch and affected confirmed teams." : ""}`)) return;
      if (removedSlot) {
        const owners = removedSlot === "c" ? Object.fromEntries(Object.entries(split.owners || {}).filter(([,id]) => id !== node.id)) : {};
        plan.teamSplit = {...split,[removedSlot]:"",owners};
      }
      plan.nodes = plan.nodes.filter(item => item.id !== node.id);
      for (const child of plan.nodes) if (child.parent === node.id) child.parent = node.parent;
      save(draft, "Structure saved in this browser.", true);
    }

    function onSubmit(event) {
      const form = event.target;
      if (form.dataset.structureForm !== "node") return;
      event.preventDefault();
      if (!canManage()) return;
      const fields = new FormData(form);
      const value = field => String(fields.get(field) || "").trim().slice(0,100);
      const draft = structuredClone(model), plan = draft.plans.find(item => item.id === draft.active);
      const index = plan.nodes.findIndex(item => item.id === editing), old = plan.nodes[index];
      if (!old && plan.nodes.length >= maxNodes) { tell(`Up to ${maxNodes} positions can be saved in the structure.`); return; }
      const label = value("label"), kind = value("kind"), pic = value("pic");
      if (!label || !kinds.includes(kind) || (pic && pic !== old?.pic && (!people.has(pic) || usedByAnother(pic,old?.id)))) { tell("Check the name, type and PIC."); return; }
      const node = { id: old?.id || nextId(plan.nodes), label, kind, parent: value("parent"), pic, picName: people.get(pic)?.name || (pic ? old?.picName || "" : "") };
      if (old) plan.nodes[index] = node; else plan.nodes.push(node);
      if (!validate(plan.nodes)) { tell(`Reporting lines cannot form a loop or exceed ${maxDepth} levels.`); return; }
      if (save(draft, "Structure saved in this browser.", true)) {
        host.querySelector('[name="label"]').focus();
      }
    }

    function mount(target, staff, nextClients = null) {
      if (!canManage()) return;
      const roster = staff.filter(person => person.directory_active !== false && person.id && (person.display_name || person.full_name))
        .map(person => {
          const role = String(person.role || "staff").toLowerCase();
          const roleLabel = Object.hasOwn(roleLabels,role) ? roleLabels[role] : "PIC";
          return [person.id,{name:person.display_name || person.full_name,fullName:person.full_name,role,roleLabel,
            division:nameKey(person.team_division),
            title:person.employment_title || roleLabel,kind:ownerRoles.includes(role) ? roleLabel : "Role"}];
        }).sort((a,b) => a[1].name.localeCompare(b[1].name));
      const signature = JSON.stringify(roster);
      const clientsChanged = nextClients !== clientRows;
      clientRows = nextClients;
      if (target === host && signature === rosterKey && section === "chart") {
        if (clientsChanged || splitMode === "next") refreshLoadSummary();
        return;
      }
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
          if (canManage() && event.target.matches("[data-structure-split]")) updateSplit(event.target);
        });
      }
      rosterKey = signature;
      people = new Map(roster);
      render();
    }
    function refreshClients(nextClients) {
      if (!canManage()) return;
      clientRows = nextClients;
      if (!host?.isConnected) return;
      if (section === "chart") refreshLoadSummary();
      else render();
    }
    return { mount,refreshClients };
  }
  window.ManagementStructure = { create };
})();
