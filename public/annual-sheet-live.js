/* Authenticated transport for the shared annual sheet. Never stores operational data locally. */
(() => {
  "use strict";
  if (new URLSearchParams(location.search).get("live") !== "1") return;
  const team = new URLSearchParams(location.search).get("team") === "tax" ? "tax" : "accounting";
  const expectedUserId = new URLSearchParams(location.search).get("account") || "";
  let context = null, undoStack = [], redoStack = [], revision = 0, readPromise = null, readController = null, clientsPromise = null;
  const equal = (a, b) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
  function cancelLoad() { revision++; readController?.abort(); readController = null; readPromise = null; }
  async function request(body, options = {}) {
    if (body) cancelLoad();
    const response = await fetch(`/api/annual-sheet${body ? "" : `?team=${team}&part=${options.clients ? "clients" : "sheet"}`}`, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(context?.userId || expectedUserId ? { "x-workspace-user": context?.userId || expectedUserId } : {}) },
      ...(body ? { body: JSON.stringify({ ...body, team }) } : {}),
      ...(options.signal ? { signal: options.signal } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (options.readRevision !== undefined && options.readRevision !== revision) return null;
    if (!response.ok) { const error = new Error(data.error || "Annual work could not be saved. Reload and retry."); error.status = response.status; throw error; }
    if (options.clients) return data.clients || [];
    context = data;
    if (window.parent !== window) window.parent.postMessage({ type: "annual-sheet:state", team, year: data.rows?.[0]?.year || 0, version: data.version, saved: !!body }, location.origin);
    return data;
  }
  function load() {
    if (readPromise) return readPromise;
    const controller = new AbortController(); readController = controller;
    const pending = request(undefined, { signal: controller.signal, readRevision: revision }).finally(() => { if (readPromise === pending) { readPromise = null; readController = null; } });
    readPromise = pending; return pending;
  }
  function loadClients() {
    if (clientsPromise) return clientsPromise;
    clientsPromise = request(undefined, { clients: true }).finally(() => { clientsPromise = null; });
    return clientsPromise;
  }
  const fields = () => ["clientName", "year", "accountingPic", "taxPic", "progress", "deadline", "notes", "ntpe", ...(team === "tax" ? ["subjectType", "groupName", "recordMethod", "documents", "preparation", "filing", "payableAmount", "paymentDate", "paymentNtpn", "filingDate"] : ["technicalAdminMonths", "dataMonths", "reportPreparationMonths", "paymentValue"]), ...(context?.columns || []).map(col => col.field)];
  function rowEdits(before, next) {
    return next.rows.flatMap(row => {
      const old = before.rows.find(item => item.id === row.id); if (!old) return [];
      const changed = fields().filter(field => !equal(old[field], row[field]));
      if (!changed.length) return [];
      const baselineFields = new Set(changed);
      if (changed.includes("ntpe")) baselineFields.add("progress");
      if (changed.includes("progress") && team === "accounting") ["technicalAdminMonths", "dataMonths", "reportPreparationMonths"].forEach(field => baselineFields.add(field));
      return [{ id: row.id, changes: Object.fromEntries(changed.map(field => [field, row[field] ?? ""])), before: Object.fromEntries([...baselineFields].map(field => [field, old[field] ?? ""])) }];
    });
  }
  async function commit(before, next, label) {
    if (!equal(before.customColumns, next.customColumns)) {
      const added = next.customColumns.find(col => !before.customColumns.some(old => old.field === col.field));
      if (!added) throw new Error("Shared columns cannot be deleted through Undo.");
      const result = await request({ action: "add-column", title: added.title, type: added.type });
      undoStack = []; redoStack = []; return result;
    }
    const edits = rowEdits(before, next), creates = next.rows.filter(row => !before.rows.some(old => old.id === row.id));
    if (!edits.length && !creates.length) return context;
    const result = await request({ action: "commit", edits, creates });
    redoStack = [];
    if (creates.length) undoStack = [];
    else {
      const actual = rowEdits(before, { rows: result.rows });
      undoStack.push({ before, after: structuredClone(result), edits: actual, label });
      if (undoStack.length > 50) undoStack.shift();
    }
    return result;
  }
  async function replay(redo) {
    const source = redo ? redoStack : undoStack, entry = source[source.length - 1];
    if (!entry) return context;
    const edits = entry.edits.map(edit => {
      const from = (redo ? entry.before.rows : entry.after.rows).find(row => row.id === edit.id);
      const to = (redo ? entry.after.rows : entry.before.rows).find(row => row.id === edit.id);
      const changed = Object.keys(edit.changes), baseline = new Set(changed);
      if (changed.includes("ntpe")) baseline.add("progress");
      if (changed.includes("progress") && team === "accounting") ["technicalAdminMonths", "dataMonths", "reportPreparationMonths"].forEach(field => baseline.add(field));
      return { id: edit.id, changes: Object.fromEntries(changed.map(field => [field, to[field] ?? ""])), before: Object.fromEntries([...baseline].map(field => [field, from[field] ?? ""])) };
    });
    const result = await request({ action: "commit", edits, creates: [] });
    source.pop(); (redo ? undoStack : redoStack).push(entry); return result;
  }
  async function manageRow(row, restore) {
    const result = await request({ action: restore ? "restore-row" : "archive-row", rowId: row.id, before: row });
    undoStack = []; redoStack = []; return result;
  }
  function clearAccess() { cancelLoad(); context = null; undoStack = []; redoStack = []; }
  window.AnnualSheetLive = { load, cancelLoad, clearAccess, loadClients, commit, manageRow, undo: () => replay(false), redo: () => replay(true), get canUndo() { return !!undoStack.length; }, get canRedo() { return !!redoStack.length; }, get context() { return context; } };
})();
