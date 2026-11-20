/* Allocation table and spreadsheet interactions. Loaded only for the Allocation view. */
(() => {
  "use strict";

  function create(live) {
    const {
      state, allocationChanged, allocationPicCounts, allocationRows, captureVirtualTableScrollPositions, compareText, escapeAttr, escapeHtml,
      hasLeadershipAccess, isActiveClientRecord, optionsMarkup, parseCaseSheetClipboard, persistDemoState,
      restoreVirtualTableScrollPositions, safeHtml, sortHeader, splitBusinessName, syncBrowserHistory,
      virtualSpacer, windowedRows
    } = live;

    function allocationFormLabel(form) {
      const normalized = String(form || "").trim().toLowerCase();
      return !normalized || normalized === "individual"
        ? '<abbr title="Orang Pribadi (Individual)">OP</abbr>'
        : escapeHtml(form);
    }

    function allocationPicOptions(people, selected) {
      const choices = selected && !people.includes(selected) ? [...people, selected] : people;
      return `<option value="" ${!selected ? "selected" : ""}>No PIC</option>${optionsMarkup(choices, selected)}`;
    }

    function allocationOverview(rows) {
      const pendingChanges = rows.filter(allocationChanged).length;
      const picSummary = (team, title, people, field) => {
        const counts = allocationPicCounts(rows, people, field);
        const legend = pendingChanges ? counts.some(item => item.delta) ? "Saved &#8594; Proposed" : "No net change" : "Saved";
        return `<section class="allocation-pic-summary" data-allocation-pic-team="${team}" aria-label="${title} client counts"><h3><span class="allocation-pic-team">${team === "acc" ? "ACC" : "TAX"}</span>${title}<small class="allocation-pic-legend">${legend}</small></h3><div class="allocation-pic-list" role="list">${counts.map(item => {
        const delta = `${item.delta > 0 ? "+" : ""}${item.delta}`;
        const description = `${item.pic || "No PIC"}: ${item.clients} saved; ${item.proposed} proposed; change ${delta}. Filtered clients only.`;
        return `<div class="allocation-pic-count ${item.delta ? "has-change" : ""} ${item.pic ? "" : `is-unassigned ${item.clients || item.proposed ? "has-clients" : ""}`}" role="listitem" data-allocation-summary-pic="${escapeAttr(item.pic)}" data-allocation-current="${item.clients}" data-allocation-proposed="${item.proposed}" data-allocation-delta="${item.delta}" title="${escapeAttr(description)}" aria-label="${escapeAttr(description)}"><span>${escapeHtml(item.pic || "No PIC")}</span><span class="allocation-pic-values"><strong>${item.clients}</strong>${item.delta ? `<span class="allocation-pic-arrow" aria-hidden="true">&#8594;</span><b data-allocation-simulated-count>${item.proposed}</b><small class="allocation-pic-delta">${delta}</small>` : ""}</span></div>`;
        }).join("")}</div></section>`;
      };
      return `<div class="metric"><div class="eyebrow">Visible Clients</div><strong>${rows.length}</strong><div class="sub">${pendingChanges ? "Draft simulation." : "Current assignments."} Filters applied.</div></div>${picSummary("acc", "Accounting PIC", live.ACC_PICS, "accountingPic")}${picSummary("tax", "Tax PIC", live.TAX_PICS, "taxPic")}`;
    }

    function renderAllocation(rootOverride = null) {
      const root = rootOverride || document.getElementById("allocation-view");
      if (allocationSheetRange?.anchor && root.contains(allocationSheetRange.anchor)) clearAllocationSheetRange();
      const rows = allocationRows();
      const canEdit = hasLeadershipAccess() && !state.allocationApplying;
      const visibleIds = new Set(rows.map(client => client.id));
      state.allocationSelection = hasLeadershipAccess() ? [...new Set(state.allocationSelection)].filter(id => visibleIds.has(id)) : [];
      const selectedIds = new Set(state.allocationSelection);
      const selectAll = `<input type="checkbox" data-allocation-select-all aria-label="Select all visible clients" title="Select all visible clients" ${rows.length && selectedIds.size === rows.length ? "checked" : ""} ${!canEdit || !rows.length ? "disabled" : ""} />`;
      const hasDrafts = Object.keys(state.allocationDrafts).length > 0;
      const activeAllocationClients = live.clientMasterClients.filter(isActiveClientRecord);
      const allocationAccOptions = [...new Set([...live.ACC_PICS, ...activeAllocationClients.map((client) => client.accountingPic).filter(Boolean)])].sort(compareText);
      const allocationTaxOptions = [...new Set([...live.TAX_PICS, ...activeAllocationClients.map((client) => client.taxPic).filter(Boolean)])].sort(compareText);
      const allocationWindow = windowedRows(rows, "allocation-clients", 48);
      const isMobileLayout = window.matchMedia("(max-width: 760px)").matches;
      const allocationOrder = state.sorts.allocation.key === "createdAt" ? (state.sorts.allocation.dir === "asc" ? "oldest" : "newest") : state.sorts.allocation.key === "form" && state.sorts.allocation.dir === "asc" ? "form" : "column";
      const pendingChanges = rows.filter(allocationChanged).length;

      root.innerHTML = safeHtml(`
        <div class="workspace-frame workspace-management">
          <section class="allocation-overview" aria-label="Allocation client distribution">
            ${allocationOverview(rows)}
          </section>

          <section class="panel">
            <div class="toolbar compact-toolbar">
              <div class="toolbar-left">
                <select id="allocation-acc-filter" class="filter-select" aria-label="Filter by ACC PIC"><option value="all">All ACC PIC</option><option value="__no_pic__" ${state.allocationAccFilter === "__no_pic__" ? "selected" : ""}>No PIC</option>${allocationAccOptions.map((pic) => `<option value="${escapeAttr(pic)}" ${state.allocationAccFilter === pic ? "selected" : ""}>${escapeHtml(pic)}</option>`).join("")}</select>
                <select id="allocation-tax-filter" class="filter-select" aria-label="Filter by Tax PIC"><option value="all">All Tax PIC</option><option value="__no_pic__" ${state.allocationTaxFilter === "__no_pic__" ? "selected" : ""}>No PIC</option>${allocationTaxOptions.map((pic) => `<option value="${escapeAttr(pic)}" ${state.allocationTaxFilter === pic ? "selected" : ""}>${escapeHtml(pic)}</option>`).join("")}</select>
                <label class="pill neutral allocation-filter-mode" title="Unchecked: use saved Current PIC. Checked: use proposed Next PIC."><input id="allocation-filter-next-pic" type="checkbox" ${state.allocationFilterNextPic ? "checked" : ""} /> Filter by Next PIC</label>
                <select id="allocation-order" class="filter-select" aria-label="Allocation row order" title="Date added means the original Client Master creation date, not the latest PIC update."><option value="form" ${allocationOrder === "form" ? "selected" : ""}>Company form / name</option><option value="oldest" ${allocationOrder === "oldest" ? "selected" : ""}>Oldest added first</option><option value="newest" ${allocationOrder === "newest" ? "selected" : ""}>Newest added first</option>${allocationOrder === "column" ? '<option value="column" selected disabled>Column sort</option>' : ""}</select>
                <select id="allocation-engagement-filter" class="filter-select" aria-label="Filter client engagement">${[["all","All engagements"],["contract","Contract clients only"],["free_of_charge","Free of Charge clients only"],["on_demand","On Demand clients only"]].map(([value,label]) => `<option value="${value}" ${state.allocationEngagementFilter === value ? "selected" : ""}>${label}</option>`).join("")}</select>
                <input id="allocation-query" class="filter-input" type="text" placeholder="Search client, code, current PIC, next PIC" value="${state.allocationQuery}" />
              </div>
              <div class="toolbar-right">
                <label class="pill neutral">Allocation year <input id="allocation-year" type="number" min="2000" max="2200" value="${state.allocationYear}" style="width:72px" ${state.allocationApplying ? "disabled" : ""} /></label>
                <label class="pill neutral"><input id="allocation-changed-only" type="checkbox" ${state.allocationShowChangedOnly ? "checked" : ""} /> Changed only</label>
                <button class="ghost-btn" data-preview-allocation title="Preview the filtered allocation on Legal paper, then print or download PDF" ${state.allocationApplying || live.allocationPreviewPreparing || !rows.length ? "disabled" : ""}>${live.allocationPreviewPreparing ? "Preparing PDF..." : "Preview PDF"}</button>
                <button class="ghost-btn" data-print-allocation-report="yes">Print Latest Report</button>
                <button class="ghost-btn" data-reset-allocation-drafts title="Discard all unsaved PIC drafts, including clients hidden by filters" ${!canEdit || !hasDrafts ? "disabled" : ""}>Reset unsaved</button>
                <span class="pill warning allocation-pending-status" title="Pending changes in the current filtered view" ${pendingChanges ? "" : "hidden"}><strong data-allocation-pending-count>${pendingChanges}</strong> pending</span>
                <button class="solid-btn" data-apply-allocation="yes" title="Save all pending PIC changes, including clients hidden by filters" ${!canEdit ? "disabled" : ""}>${state.allocationApplying ? "Saving..." : "Apply PIC Update"}</button>
              </div>
            </div>

            ${isMobileLayout ? `<label class="pill neutral allocation-mobile-select">${selectAll} Select visible clients</label>` : ""}
            ${selectedIds.size ? `<div class="toolbar compact-toolbar allocation-bulk-toolbar" aria-label="Bulk PIC assignment"><div class="toolbar-left"><strong role="status">${selectedIds.size} selected</strong><button class="ghost-btn" data-clear-allocation-selection ${!canEdit ? "disabled" : ""}>Clear selection</button></div><div class="toolbar-right"><select class="filter-select" data-allocation-bulk="acc" aria-label="Assign ACC PIC to selected clients" ${!canEdit ? "disabled" : ""}><option value="__choose__" selected disabled>Assign ACC PIC...</option><option value="">No PIC</option>${optionsMarkup(live.ACC_PICS, "__choose__")}</select><select class="filter-select" data-allocation-bulk="tax" aria-label="Assign Tax PIC to selected clients" ${!canEdit ? "disabled" : ""}><option value="__choose__" selected disabled>Assign Tax PIC...</option><option value="">No PIC</option>${optionsMarkup(live.TAX_PICS, "__choose__")}</select><span class="subline">Draft only. Save with Apply PIC Update.</span></div></div>` : ""}

            ${!isMobileLayout ? `<div class="allocation-sheet-help"><strong>Allocation sheet</strong><span>Next PIC cells: Shift+click or drag cell edges to select. Ctrl+C / Ctrl+V to copy / paste.</span><span data-allocation-sheet-message role="status" aria-live="polite">Blank or No PIC clears an assignment. Drafts only until Apply.</span></div><div class="table-wrap" data-virtual-table="allocation-clients" data-row-height="48">
              <table class="allocation-sheet" aria-label="Allocation spreadsheet">
                <thead>
                  <tr>
                    <th class="allocation-check-cell">${selectAll}</th>
                    <th>No.</th>
                    <th>${sortHeader("allocation", "code", "Code")}</th>
                    <th>${sortHeader("allocation", "form", "Form")}</th>
                    <th>${sortHeader("allocation", "name", "Client Name")}</th>
                    <th>${sortHeader("allocation", "accPic", "Current ACC PIC")}</th>
                    <th>${sortHeader("allocation", "taxPic", "Current TAX PIC")}</th>
                    <th class="allocation-next-heading">${sortHeader("allocation", "nextAccPic", "Next ACC PIC")}</th>
                    <th class="allocation-next-heading">${sortHeader("allocation", "nextTaxPic", "Next TAX PIC")}</th>
                    <th>${sortHeader("allocation", "status", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${virtualSpacer(10, allocationWindow.top)}${allocationWindow.rows.map((client, index) => {
                    const draft = state.allocationDrafts[client.id] || {};
                    const nextAcc = draft.nextAccPic ?? client.accountingPic ?? "";
                    const nextTax = draft.nextTaxPic ?? client.taxPic ?? "";
                    const changed = nextAcc !== (client.accountingPic || "") || nextTax !== (client.taxPic || "");
                    const identity = splitBusinessName(client);
                    return `
                      <tr data-allocation-row="${escapeAttr(client.id)}" data-selected="${selectedIds.has(client.id)}">
                        <td class="allocation-check-cell"><input type="checkbox" data-allocation-select="${escapeAttr(client.id)}" aria-label="Select ${escapeAttr(client.name)}" ${selectedIds.has(client.id) ? "checked" : ""} ${!canEdit ? "disabled" : ""} /></td>
                        <td>${allocationWindow.start + index + 1}</td>
                        <td>${escapeHtml(client.clientCode)}</td>
                        <td>${allocationFormLabel(identity.form)}</td>
                        <td>${escapeHtml(identity.name)}</td>
                        <td>${escapeHtml(client.accountingPic || "No PIC")}</td>
                        <td>${escapeHtml(client.taxPic || "No PIC")}</td>
                        <td data-allocation-cell="acc" tabindex="0" aria-label="Next ACC PIC for ${escapeAttr(client.name)}" aria-selected="false" class="${nextAcc !== (client.accountingPic || "") ? "is-pending" : ""}">
                          <select class="inline-select" aria-label="Next ACC PIC for ${escapeAttr(client.name)}" data-allocation-acc="${client.id}" ${!canEdit ? "disabled" : ""}>
                            ${allocationPicOptions(live.ACC_PICS, nextAcc)}
                          </select>
                        </td>
                        <td data-allocation-cell="tax" tabindex="0" aria-label="Next Tax PIC for ${escapeAttr(client.name)}" aria-selected="false" class="${nextTax !== (client.taxPic || "") ? "is-pending" : ""}">
                          <select class="inline-select" aria-label="Next Tax PIC for ${escapeAttr(client.name)}" data-allocation-tax="${client.id}" ${!canEdit ? "disabled" : ""}>
                            ${allocationPicOptions(live.TAX_PICS, nextTax)}
                          </select>
                        </td>
                        <td data-allocation-status><span class="pill ${changed ? "warning" : "accent"}">${changed ? "Pending Update" : "Unchanged"}</span></td>
                      </tr>
                    `;
                  }).join("") || `<tr><td colspan="10"><div class="empty-state">No clients match the current allocation scope.</div></td></tr>`}${virtualSpacer(10, allocationWindow.bottom)}
                </tbody>
              </table>
            </div>` : ""}

            ${isMobileLayout ? `<div>
              <div class="list-grid">
                ${rows.map((client, index) => {
                  const draft = state.allocationDrafts[client.id] || {};
                  const nextAcc = draft.nextAccPic ?? client.accountingPic ?? "";
                  const nextTax = draft.nextTaxPic ?? client.taxPic ?? "";
                  const changed = nextAcc !== (client.accountingPic || "") || nextTax !== (client.taxPic || "");
                  const identity = splitBusinessName(client);
                  return `
                    <div class="mobile-card" data-allocation-row="${escapeAttr(client.id)}" data-selected="${selectedIds.has(client.id)}">
                      <div class="mobile-card-header">
                        <div>
                          <div class="mobile-card-title"><label class="allocation-card-select"><input type="checkbox" data-allocation-select="${escapeAttr(client.id)}" aria-label="Select ${escapeAttr(client.name)}" ${selectedIds.has(client.id) ? "checked" : ""} ${!canEdit ? "disabled" : ""} />${index + 1}. ${escapeHtml(identity.name)}</label></div>
                          <div class="subline">${allocationFormLabel(identity.form)} · ${escapeHtml(client.clientCode)}</div>
                        </div>
                        <span data-allocation-status class="pill ${changed ? "warning" : "accent"}">${changed ? "Pending" : "Stable"}</span>
                      </div>
                      <div class="detail-grid-2">
                        <div class="mobile-meta-box"><div class="eyebrow">ACC PIC Lama</div><strong>${escapeHtml(client.accountingPic || "No PIC")}</strong></div>
                        <div class="mobile-meta-box"><div class="eyebrow">TAX PIC Lama</div><strong>${escapeHtml(client.taxPic || "No PIC")}</strong></div>
                      </div>
                      <div class="detail-grid-2">
                        <select class="field" data-allocation-acc="${client.id}" ${!canEdit ? "disabled" : ""}>${allocationPicOptions(live.ACC_PICS, nextAcc)}</select>
                        <select class="field" data-allocation-tax="${client.id}" ${!canEdit ? "disabled" : ""}>${allocationPicOptions(live.TAX_PICS, nextTax)}</select>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>` : ""}
          </section>

          <section class="panel">
            <div class="section-title">
              <div>
                <h3>Latest PIC Update Report</h3>
                <p>Hanya klien yang benar-benar berubah pada batch terakhir akan muncul di sini.</p>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>ACC PIC Lama</th>
                    <th>ACC PIC Baru</th>
                    <th>TAX PIC Lama</th>
                    <th>TAX PIC Baru</th>
                  </tr>
                </thead>
                <tbody>
                  ${state.allocationLastReport.map((row) => `
                    <tr>
                      <td>${escapeHtml(row.clientName)}</td>
                      <td>${escapeHtml(row.previousAccPic || "No PIC")}</td>
                      <td>${escapeHtml(row.nextAccPic || "No PIC")}</td>
                      <td>${escapeHtml(row.previousTaxPic || "No PIC")}</td>
                      <td>${escapeHtml(row.nextTaxPic || "No PIC")}</td>
                    </tr>
                  `).join("") || `<tr><td colspan="5"><div class="empty-state">No allocation report generated yet.</div></td></tr>`}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      `);
      root.querySelectorAll("[data-allocation-select-all]").forEach(input => { input.indeterminate = selectedIds.size > 0 && selectedIds.size < rows.length; });
    }

    let allocationSheetRange = null, allocationSheetDrag = null;

    function allocationSheetMessage(message, error = false) {
      const node = document.querySelector("[data-allocation-sheet-message]");
      if (node) { node.textContent = message; node.dataset.error = String(error); }
    }

    function clearAllocationSheetRange() {
      document.querySelectorAll(".allocation-range-selected, .allocation-range-anchor").forEach(cell => {
        cell.classList.remove("allocation-range-selected", "allocation-range-anchor"); cell.setAttribute("aria-selected", "false");
      });
      allocationSheetRange = null; allocationSheetDrag = null;
      document.body.classList.remove("allocation-range-dragging");
    }

    function allocationSheetBounds(cell) {
      const table = cell.closest(".allocation-sheet");
      const rows = [...table.querySelectorAll("tbody [data-allocation-row]")].map(row => [...row.querySelectorAll("[data-allocation-cell]")]);
      const range = allocationSheetRange?.anchor.isConnected && allocationSheetRange.anchor.closest("table") === table ? allocationSheetRange : { anchor:cell, focus:cell };
      const point = item => { const r = rows.findIndex(row => row.includes(item)); return { r, c:rows[r]?.indexOf(item) ?? -1 }; };
      const a = point(range.anchor), b = point(range.focus);
      return { rows, r0:Math.min(a.r,b.r), r1:Math.max(a.r,b.r), c0:Math.min(a.c,b.c), c1:Math.max(a.c,b.c), end:b };
    }

    function selectAllocationSheetRange(cell, extend = false) {
      if (!extend || !allocationSheetRange?.anchor.isConnected || allocationSheetRange.anchor.closest("table") !== cell.closest("table")) clearAllocationSheetRange();
      allocationSheetRange = { anchor:allocationSheetRange?.anchor || cell, focus:cell };
      const bounds = allocationSheetBounds(cell);
      bounds.rows.flat().forEach(item => { item.classList.remove("allocation-range-selected", "allocation-range-anchor"); item.setAttribute("aria-selected", "false"); });
      for (let r = bounds.r0; r <= bounds.r1; r++) for (let c = bounds.c0; c <= bounds.c1; c++) {
        bounds.rows[r][c].classList.add("allocation-range-selected"); bounds.rows[r][c].setAttribute("aria-selected", "true");
      }
      allocationSheetRange.anchor.classList.add("allocation-range-anchor");
      allocationSheetMessage(`${bounds.r1-bounds.r0+1} row(s), ${bounds.c1-bounds.c0+1} column(s) selected. Paste one name to fill, or an Excel range.`);
    }

    function stageAllocationCells(plans) {
      if (!hasLeadershipAccess() || state.allocationApplying) throw new Error("PIC editing is unavailable while saving or without leadership access.");
      const visible = new Map(allocationRows().map(client => [client.id,client]));
      const normalize = value => String(value ?? "").trim().replace(/\s+/g," ").toLocaleLowerCase("id-ID");
      // Validate the entire clipboard/bulk action before changing any draft.
      const checked = plans.map(plan => {
        const client = visible.get(plan.id);
        if (!client || !["acc","tax"].includes(plan.field)) throw new Error("Only visible Next PIC cells can be edited.");
        const key = normalize(plan.value), people = plan.field === "acc" ? live.ACC_PICS : live.TAX_PICS;
        const matches = people.filter(name => normalize(name) === key);
        const division = plan.field === "acc" ? "Accounting Team" : "Tax Team";
        const ambiguous = live.staffDirectoryLoaded && live.staffDirectory.filter(person => person.directory_active !== false && person.role !== "partner" && person.team_division === division && normalize(person.display_name || person.full_name) === key).length > 1;
        const current = plan.field === "acc" ? client.accountingPic : client.taxPic;
        const value = !key || key === "no pic" ? "" : ambiguous ? null : matches.length === 1 ? matches[0] : plan.value === current ? current : null;
        if (value === null) throw new Error(`${plan.field.toUpperCase()} PIC "${String(plan.value).slice(0,80)}" is unknown or ambiguous. Choose an active ${plan.field === "acc" ? "Accounting" : "Tax"} PIC.`);
        return { ...plan, client, value };
      });
      checked.forEach(({ id, field, client, value }) => {
        state.allocationDrafts[id] = { nextAccPic:client.accountingPic || "", nextTaxPic:client.taxPic || "", ...state.allocationDrafts[id], [field === "acc" ? "nextAccPic" : "nextTaxPic"]:value };
      });
      refreshAllocationDrafts(new Set(checked.map(plan => plan.id)));
      persistDemoState(); syncBrowserHistory("replace");
    }

    function refreshAllocationDrafts(changedIds) {
      const root = document.getElementById("allocation-view"), rows = allocationRows();
      const renderedIds = [...root.querySelectorAll("[data-allocation-row]")].map(row => row.dataset.allocationRow);
      // Rebuild only when an explicit sort/filter actually changes row membership/order.
      if (renderedIds.length !== rows.length || rows.some((row,i) => row.id !== renderedIds[i])) {
        const wrap = root.querySelector('[data-virtual-table="allocation-clients"]'), left = wrap?.scrollLeft || 0;
        captureVirtualTableScrollPositions(); clearAllocationSheetRange(); renderAllocation(); restoreVirtualTableScrollPositions();
        const nextWrap = root.querySelector('[data-virtual-table="allocation-clients"]');
        if (nextWrap) nextWrap.scrollLeft = left;
        return;
      }
      const renderedRows = new Map([...root.querySelectorAll("[data-allocation-row]")].map(row => [row.dataset.allocationRow,row]));
      for (const client of rows) {
        if (!changedIds.has(client.id)) continue;
        const row = renderedRows.get(client.id);
        for (const field of ["acc","tax"]) {
          const current = (field === "acc" ? client.accountingPic : client.taxPic) || "";
          const next = state.allocationDrafts[client.id]?.[field === "acc" ? "nextAccPic" : "nextTaxPic"] ?? current;
          const select = row.querySelector(`[data-allocation-${field}]`);
          select.value = next;
          select.closest("[data-allocation-cell]")?.classList.toggle("is-pending",next !== current);
        }
        const changed = allocationChanged(client), status = row.querySelector("[data-allocation-status]");
        if (status.tagName === "TD") status.innerHTML = safeHtml(`<span class="pill ${changed ? "warning" : "accent"}">${changed ? "Pending Update" : "Unchanged"}</span>`);
        else { status.className = `pill ${changed ? "warning" : "accent"}`; status.textContent = changed ? "Pending" : "Stable"; }
      }
      root.querySelector(".allocation-overview").innerHTML = safeHtml(allocationOverview(rows));
      const pending = rows.filter(allocationChanged).length;
      root.querySelector("[data-allocation-pending-count]").textContent = pending;
      root.querySelector(".allocation-pending-status").hidden = !pending;
      root.querySelector("[data-reset-allocation-drafts]").disabled = !Object.keys(state.allocationDrafts).length;
    }

    document.addEventListener("pointerdown", event => {
      const cell = event.target.closest?.("[data-allocation-cell]");
      if (!cell) { if (!event.target.closest?.(".allocation-sheet")) clearAllocationSheetRange(); return; }
      if (event.button !== undefined && event.button !== 0) return;
      selectAllocationSheetRange(cell,event.shiftKey);
      allocationSheetDrag = event.pointerType === "touch" ? null : { pointerId:event.pointerId, table:cell.closest("table") };
      if (event.shiftKey || event.target === cell) { event.preventDefault(); cell.focus({ preventScroll:true }); }
    });
    document.addEventListener("pointermove", event => {
      const drag = allocationSheetDrag, cell = event.target.closest?.("[data-allocation-cell]");
      if (!drag || drag.pointerId !== event.pointerId || !cell || cell.closest("table") !== drag.table || cell === allocationSheetRange?.focus) return;
      event.preventDefault(); selectAllocationSheetRange(cell,true); document.body.classList.add("allocation-range-dragging"); window.getSelection()?.removeAllRanges();
    });
    document.addEventListener("pointerup", event => {
      if (allocationSheetDrag?.pointerId !== event.pointerId) return;
      if (document.body.classList.contains("allocation-range-dragging")) { event.preventDefault(); allocationSheetRange?.anchor.focus({ preventScroll:true }); }
      allocationSheetDrag = null; document.body.classList.remove("allocation-range-dragging");
    });
    document.addEventListener("pointercancel", clearAllocationSheetRange);
    document.addEventListener("focusin", event => {
      const cell = event.target.closest?.("[data-allocation-cell]");
      if (cell && !allocationSheetDrag && !cell.classList.contains("allocation-range-selected")) selectAllocationSheetRange(cell);
    });
    document.addEventListener("keydown", event => {
      const cell = event.target.closest?.("[data-allocation-cell]");
      if (!cell || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") { clearAllocationSheetRange(); cell.focus({ preventScroll:true }); event.preventDefault(); return; }
      if (event.target.tagName === "SELECT" && !event.shiftKey) return;
      if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); cell.querySelector("select").focus(); return; }
      if (!["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Tab"].includes(event.key)) return;
      const bounds = allocationSheetBounds(cell), end = bounds.end;
      let r = end.r, c = end.c;
      if (event.key === "Tab") { c += event.shiftKey ? -1 : 1; if (c > 1) { c = 0; r++; } if (c < 0) { c = 1; r--; } }
      else { r += event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0; c += event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0; }
      const next = bounds.rows[r]?.[c];
      if (!next) return;
      if (event.shiftKey && event.key !== "Tab" && !allocationSheetRange?.anchor.isConnected) selectAllocationSheetRange(cell);
      event.preventDefault(); selectAllocationSheetRange(next,event.shiftKey && event.key !== "Tab");
      (event.shiftKey && event.key !== "Tab" ? allocationSheetRange.anchor : next).focus({ preventScroll:true }); next.scrollIntoView({ block:"nearest",inline:"nearest" });
    });
    document.addEventListener("copy", event => {
      const cell = event.target.closest?.("[data-allocation-cell]");
      if (!cell || !event.clipboardData) return;
      const bounds = allocationSheetBounds(cell), lines = [];
      const encode = value => /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"','""')}"` : value;
      for (let r = bounds.r0; r <= bounds.r1; r++) lines.push(bounds.rows[r].slice(bounds.c0,bounds.c1+1).map(item => encode(item.querySelector("select").selectedOptions[0]?.textContent || "No PIC")).join("\t"));
      event.preventDefault(); event.clipboardData.setData("text/plain",lines.join("\r\n"));
      allocationSheetMessage(`Copied ${lines.length} row(s).`);
    });
    document.addEventListener("paste", event => {
      const cell = event.target.closest?.("[data-allocation-cell]");
      if (!cell || !event.clipboardData) return;
      event.preventDefault();
      try {
        const bounds = allocationSheetBounds(cell), data = parseCaseSheetClipboard(event.clipboardData.getData("text/plain"));
        const fill = data.length === 1 && data[0].length === 1;
        const height = fill ? bounds.r1-bounds.r0+1 : data.length, width = fill ? bounds.c1-bounds.c0+1 : data[0].length;
        if (height > 250) throw new Error("Use up to 250 rows per paste.");
        if (bounds.r0 + height > bounds.rows.length || bounds.c0 + width > 2) throw new Error("Paste exceeds the visible rows or Next PIC columns. No drafts changed.");
        const plans = [];
        for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
          const target = bounds.rows[bounds.r0+r][bounds.c0+c];
          plans.push({ id:target.closest("[data-allocation-row]").dataset.allocationRow, field:target.dataset.allocationCell, value:fill ? data[0][0] : data[r][c] });
        }
        stageAllocationCells(plans);
        allocationSheetMessage(`${plans.length} cell(s) staged. Review the simulation, then Apply PIC Update.`);
      } catch (error) { allocationSheetMessage(error.message,true); }
    });

    return { render: renderAllocation, stageCells: stageAllocationCells };
  }

  window.AllocationSheet = { create };
})();
