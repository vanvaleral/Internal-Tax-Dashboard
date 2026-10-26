type Row = Record<string, any>;
const isLeadership = (role: any) => ["leader", "supervisor", "partner", "admin"].includes(String(role || "").toLowerCase());
export type AnnualTeam = "accounting" | "tax";
export type AnnualColumn = { field: string; title: string; type: string; width: number };
export const accountingStages = ["Data Request", "In Process", "Financials Done", "Equalization", "Review", "Meeting", "SPT Ready", "Payment", "Reported", "Done"];
export const taxStages = ["Data Request", "Preparation", "Confirmation", "Review", "Ready to File", "Payment", "Reported", "Done"];
const monthFields = ["technicalAdminMonths", "dataMonths", "reportPreparationMonths"];
const taxChecks: Record<string, string[]> = { documents: ["previousSpt", "lifestyleAnalysis", "assetReview"], preparation: ["clientMeeting", "finish", "meeting"], filing: ["spt", "bayar", "sheetFiled"] };
const text = (value: any) => value == null || value === "-" ? "" : String(value).trim();
const label = (person: Row) => text(person.display_name || person.full_name);
const equal = (a: any, b: any) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");
export const annualScope = (team: AnnualTeam) => team === "tax" ? "annual_tax" : "annual_accounting";
export function annualTeam(value: any): AnnualTeam { if (!["accounting", "tax"].includes(value)) throw new Error("Choose Accounting or Tax."); return value; }
function profileId(row: Row, team: AnnualTeam, staff: Row[]) {
  const explicit = team === "accounting" ? row.accountingPicProfileId || row.reportPicProfileId : row.taxPicProfileId;
  if (explicit) return String(explicit);
  const name = text(team === "accounting" ? row.accountingPic || row.reportPic : row.taxPic).toLowerCase();
  const matches = staff.filter(person => person.team_division === (team === "accounting" ? "Accounting Team" : "Tax Team") && [person.display_name, person.full_name].some(value => text(value).toLowerCase() === name));
  return name && matches.length === 1 ? matches[0].id : "";
}
export function annualCanEdit(row: Row, team: AnnualTeam, actor: Row, staff: Row[]) {
  return isLeadership(actor.role) || profileId(row, team, staff) === actor.id || (Array.isArray(row.assistantProfileIds) && row.assistantProfileIds.includes(actor.id));
}
export function annualCanRead(row: Row, actor: Row, staff: Row[]) {
  return annualCanEdit(row, "accounting", actor, staff) || annualCanEdit(row, "tax", actor, staff);
}
function amount(value: any) {
  if (text(value).toLowerCase() === "nihil") return 0;
  if (!text(value)) return "";
  const parsed = typeof value === "number" ? value : Number(/^\d{1,3}(\.\d{3})+$/.test(text(value)) ? text(value).replace(/\./g, "") : value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "";
}
function date(value: any) {
  const raw = text(value), match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : raw;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso)) ? iso : "";
}
export function annualToSheet(row: Row, team: AnnualTeam, staff: Row[], columns: AnnualColumn[] = []): Row {
  const accId = profileId(row, "accounting", staff), taxId = profileId(row, "tax", staff);
  const assignedName = (id: string, fallback: any) => label(staff.find(person => person.id === id) || {}) || text(fallback);
  const output: Row = {
    id: String(row.id || row.annualWorkId || ""), subjectId: String(row.subjectId || row.annualWorkId || row.id || ""), clientId: text(row.clientId), clientName: text(row.clientName),
    year: Number(row.taxYear || row.year) || 0, outside: ["Lepas", "Outside contract"].includes(row.contractType) || !row.clientId,
    accountingPic: assignedName(accId, row.accountingPic || row.reportPic), accountingPicId: accId,
    taxPic: assignedName(taxId, row.taxPic), taxPicId: taxId, assistantIds: row.assistantProfileIds || [],
    progress: text(row.progress) || (row.reported || Number(row.laporCount) > 0 ? "Reported" : "Data Request"), deadline: date(row.deadline),
    notes: text(row.notes), ntpe: text(row.ntpe), progressBeforeNtpe: text(row.progressBeforeNtpe)
  };
  if (team === "accounting") {
    monthFields.forEach(field => { output[field] = Array.isArray(row[field]) ? row[field] : []; });
    output.paymentValue = amount(row.paymentAmount);
  } else {
    output.subjectType = row.subjectType || (/^(PT|CV|BUT|YAYASAN)\b/i.test(output.clientName) ? "Corporate" : "Individual");
    output.groupName = text(row.groupName); output.recordMethod = row.recordMethod || row.status || "Pencatatan";
    Object.entries(taxChecks).forEach(([field, legacy]) => { output[field] = Array.isArray(row[field]) ? row[field] : legacy.flatMap((key, index) => row[key] || key === "sheetFiled" && (row.reported || Number(row.laporCount) > 0) ? [index] : []); });
    output.payableAmount = amount(row.paymentAmount ?? row.kurangBayar); output.paymentDate = date(row.paymentDate);
    output.paymentNtpn = text(row.paymentNtpn); output.filingDate = date(row.laporDate || row.filingDate);
    output.historicalCompletion = Boolean(row.reported || Number(row.laporCount) > 0);
  }
  columns.forEach(column => { output[column.field] = row.sheetValues?.[column.field] ?? ""; });
  return output;
}
function validateField(field: string, value: any, team: AnnualTeam, columns: AnnualColumn[]) {
  const checks = monthFields.includes(field) ? 12 : field in taxChecks ? 3 : 0;
  if (checks) {
    if (!Array.isArray(value) || value.some(index => !Number.isInteger(index) || index < 0 || index >= checks) || new Set(value).size !== value.length) throw new Error(`Invalid ${field} checklist.`);
    return;
  }
  const custom = columns.find(column => column.field === field);
  if (["paymentValue", "payableAmount"].includes(field) || custom?.type === "number") {
    if (value !== "" && (typeof value !== "number" || !Number.isFinite(value) || (!custom && value < 0))) throw new Error("Enter a valid amount; use 0 for nil or leave unknown values blank.");
  } else if (field === "year") {
    if (!Number.isInteger(value) || value < 2000 || value > 2100) throw new Error("Choose a tax year from 2000 to 2100.");
  } else if (["deadline", "paymentDate", "filingDate"].includes(field) || custom?.type === "date") {
    if (value !== "" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !date(value) || new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value)) throw new Error("Use a valid YYYY-MM-DD date.");
  } else if (typeof value !== "string" || value.length > (field === "notes" ? 1000 : 180)) throw new Error(`Invalid ${field}.`);
  if (field === "progress" && !(team === "tax" ? taxStages : accountingStages).includes(value)) throw new Error("Choose a valid progress stage.");
  if (field === "subjectType" && !["Individual", "Corporate"].includes(value)) throw new Error("Choose Individual or Corporate.");
  if (field === "recordMethod" && !["Pencatatan", "Pembukuan"].includes(value)) throw new Error("Choose a valid record method.");
  if (field === "clientName" && !text(value)) throw new Error("A name is required.");
}
function taxCompletionError(row: Row) {
  if (!row.filing.includes(0) || !row.filing.includes(2) || !text(row.ntpe) || !row.filingDate) return "SPT ready, Filed, filing date and NTPE are required before completion.";
  if (row.payableAmount === "") return "Enter tax payable (0 for nil) before completion.";
  if (row.payableAmount > 0 && (!row.filing.includes(1) || !text(row.paymentNtpn) || !row.paymentDate)) return "Payment date, NTPN and Paid are required for a payable return.";
  return "";
}
const editable = (team: AnnualTeam, columns: AnnualColumn[]) => new Set(["clientName", "accountingPic", "taxPic", "progress", "deadline", "notes", "ntpe", "year", ...(team === "accounting" ? [...monthFields, "paymentValue"] : ["subjectType", "groupName", "recordMethod", ...Object.keys(taxChecks), "payableAmount", "paymentDate", "paymentNtpn", "filingDate"]), ...columns.map(column => column.field)]);
export function applyAnnualEdits(stored: Row[], edits: Row[], team: AnnualTeam, actor: Row, staff: Row[], columns: AnnualColumn[]) {
  const rows = structuredClone(stored), seen = new Set<string>();
  for (const edit of edits) {
    if (!edit?.id || seen.has(edit.id) || !edit.changes || typeof edit.changes !== "object" || Array.isArray(edit.changes)) throw new Error("Invalid or duplicate annual row edit.");
    seen.add(edit.id);
    const raw = rows.find(row => String(row.id || row.annualWorkId) === edit.id);
    if (!raw || !annualCanEdit(raw, team, actor, staff)) throw new Error("You cannot edit this annual work row.");
    const previous = annualToSheet(raw, team, staff, columns), next = structuredClone(previous), fields = Object.keys(edit.changes);
    if (!fields.length) continue;
    for (const field of fields) {
      if (!editable(team, columns).has(field)) throw new Error(`Cannot edit ${field}.`);
      if (!Object.hasOwn(edit.before || {}, field) || !equal(edit.before[field], previous[field])) throw new Error(`CONFLICT: ${previous.clientName} / ${field} changed. Reload and re-enter this edit.`);
      if (["accountingPic", "taxPic", "deadline", "year", "subjectType", "groupName"].includes(field) && !isLeadership(actor.role)) throw new Error("Only leadership can change assignments, identity, deadlines and tax years.");
      if (field === "clientName" && (!isLeadership(actor.role) || team === "accounting" && !previous.outside)) throw new Error("Client Master identity is locked; only leadership can rename outside work or SPT subjects.");
      validateField(field, edit.changes[field], team, columns); next[field] = typeof edit.changes[field] === "string" ? edit.changes[field].trim() : edit.changes[field];
    }
    for (const field of ["accountingPic", "taxPic"]) if (fields.includes(field)) {
      const division = field === "accountingPic" ? "Accounting Team" : "Tax Team";
      const matches = staff.filter(person => person.directory_active !== false && person.team_division === division && label(person) === next[field]);
      if (next[field] && matches.length !== 1) throw new Error("Choose an unambiguous active staff directory PIC.");
      next[field + "Id"] = matches[0]?.id || "";
    }
    if (team === "accounting") {
      if (fields.includes("progress")) {
        if (previous.ntpe && next.ntpe && next.progress !== "Done") throw new Error("Clear NTPE before reopening this work.");
        const field = previous.progress === "Data Request" && next.progress === "In Process" ? "dataMonths" : previous.progress === "In Process" && next.progress === "Financials Done" ? "reportPreparationMonths" : previous.progress === "Equalization" && next.progress === "Review" ? "technicalAdminMonths" : "";
        if (field) {
          if (!equal(previous[field], edit.before[field])) throw new Error(`CONFLICT: ${field} changed before the stage update.`);
          next[field] = Array.from({ length: 12 }, (_, index) => index);
        }
      }
      if (fields.includes("ntpe")) {
        if (!equal(edit.before.progress, previous.progress)) throw new Error("CONFLICT: Progress changed before NTPE was saved.");
        if (next.ntpe) { next.progressBeforeNtpe = previous.ntpe ? previous.progressBeforeNtpe : previous.progress; next.progress = "Done"; }
        else if (previous.ntpe) { next.progress = previous.progressBeforeNtpe || previous.progress; next.progressBeforeNtpe = ""; }
      }
    } else if (["progress", "documents", "preparation", "filing", "payableAmount", "paymentDate", "paymentNtpn", "filingDate", "ntpe"].some(field => fields.includes(field)) && ["Reported", "Done"].includes(next.progress)) {
      const error = taxCompletionError(next); if (error) throw new Error(error);
    }
    const changed = Object.keys(next).filter(field => !equal(next[field], previous[field]));
    for (const field of changed) {
      if (columns.some(column => column.field === field)) { raw.sheetValues = { ...raw.sheetValues, [field]: next[field] }; continue; }
      const mapping: Record<string, string> = { year: "taxYear", accountingPicId: "accountingPicProfileId", taxPicId: "taxPicProfileId", paymentValue: "paymentAmount", payableAmount: "paymentAmount", filingDate: "laporDate" };
      raw[mapping[field] || field] = next[field];
      if (team === "tax" && field in taxChecks) taxChecks[field].forEach((legacy, index) => { raw[legacy] = next[field].includes(index); });
    }
    if (changed.includes("progress")) { raw.reported = ["Reported", "Done"].includes(next.progress); if (team === "tax") raw.laporCount = raw.reported ? "1" : "0"; }
    if (team === "tax" && changed.includes("accountingPic")) { raw.reportPic = next.accountingPic; raw.reportPicProfileId = next.accountingPicId || null; }
    if (changed.length) raw.changeLog = [...(Array.isArray(raw.changeLog) ? raw.changeLog : []), { action: "annual_sheet_edit", fields: changed, before: Object.fromEntries(changed.map(field => [field, previous[field]])), after: Object.fromEntries(changed.map(field => [field, next[field]])), byProfileId: actor.id, at: new Date().toISOString() }];
  }
  for (const edit of edits.filter(item => Object.hasOwn(item.changes, "year"))) {
    const row = rows.find(item => String(item.id || item.annualWorkId) === edit.id)!;
    const key = team === "accounting" ? row.clientId : row.subjectId || row.annualWorkId || row.id;
    if (key && rows.some(other => other !== row && (team === "accounting" ? other.clientId : other.subjectId || other.annualWorkId || other.id) === key && Number(other.taxYear || other.year) === row.taxYear)) throw new Error("This client/subject already has work for that year.");
  }
  return rows;
}

export function addAnnualRows(stored: Row[], creates: Row[], team: AnnualTeam, actor: Row, staff: Row[], clients: Row[]) {
  const rows = structuredClone(stored);
  for (let input of creates) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(input.id || ""))) throw new Error("A unique annual work request ID is required.");
    if (rows.some(row => row.id === input.id || row.annualWorkId === input.id)) continue; // Safe retry after an uncertain network response.
    validateField("year", input.year, team, []); validateField("clientName", input.clientName, team, []);
    validateField("notes", input.notes || "", team, []);
    let accName = text(input.accountingPic), taxName = text(input.taxPic), clientId = "", contractType = "Lepas", assignedAccId = "", assignedTaxId = "";
    if (team === "accounting" && input.clientId) {
      const client = clients.find(item => item.id === input.clientId && item.status === "Active");
      if (!client?.accounting_pic_profile_id || !isLeadership(actor.role) && client.accounting_pic_profile_id !== actor.id) throw new Error("This client is not eligible for your annual accounting workload.");
      if (rows.some(row => row.clientId === client.id && Number(row.taxYear || row.year) === input.year)) continue;
      clientId = client.id; contractType = "Contract";
      assignedAccId = client.accounting_pic_profile_id; assignedTaxId = client.tax_pic_profile_id || "";
      accName = label(staff.find(person => person.id === assignedAccId) || {}) || text(client.accounting_pic_name);
      taxName = label(staff.find(person => person.id === assignedTaxId) || {}) || text(client.tax_pic_name);
      input = { ...input, clientName: client.legal_name };
    }
    if (!isLeadership(actor.role)) {
      const division = team === "accounting" ? "Accounting Team" : "Tax Team";
      if (actor.team_division !== division) throw new Error("Only the corresponding team PIC or leadership can add annual work.");
      if (!clientId) { accName = team === "accounting" ? label(actor) : ""; taxName = team === "tax" ? label(actor) : ""; }
    }
    const resolve = (name: string, division: string, assignedId = "") => {
      if (assignedId) {
        const person = staff.find(item => item.id === assignedId && item.directory_active !== false && item.team_division === division);
        if (!person) throw new Error("Client Master PIC is inactive or belongs to a different team. Update Allocation first.");
        return assignedId;
      }
      if (!name) return "";
      const matches = staff.filter(person => person.directory_active !== false && person.team_division === division && label(person) === name);
      if (matches.length !== 1) throw new Error("Choose an active, unambiguous annual PIC.");
      return matches[0].id;
    };
    const raw: Row = { id: input.id, annualWorkId: input.id, clientId, clientName: text(input.clientName), taxYear: input.year, contractType, accountingPic: accName, accountingPicProfileId: resolve(accName, "Accounting Team", assignedAccId) || null, taxPic: taxName, taxPicProfileId: resolve(taxName, "Tax Team", assignedTaxId) || null, progress: "Data Request", deadline: "", notes: text(input.notes), ntpe: "", paymentAmount: "", reported: false, changeLog: [{ action: "annual_sheet_created", byProfileId: actor.id, at: new Date().toISOString() }] };
    if (team === "accounting") monthFields.forEach(field => { raw[field] = []; });
    else {
      validateField("subjectType", input.subjectType || "Individual", team, []);
      const prior = input.subjectId && rows.find(row => String(row.subjectId || row.annualWorkId || row.id) === input.subjectId && Number(row.taxYear || row.year) < input.year && annualCanRead(row, actor, staff));
      raw.subjectId = prior ? input.subjectId : input.id;
      if (rows.some(row => String(row.subjectId || row.annualWorkId || row.id) === raw.subjectId && Number(row.taxYear || row.year) === input.year)) continue;
      Object.assign(raw, { subjectType: input.subjectType || "Individual", groupName: text(input.groupName), recordMethod: input.recordMethod === "Pembukuan" ? "Pembukuan" : "Pencatatan", documents: [], preparation: [], filing: [], laporDate: "", paymentDate: "", paymentNtpn: "", reportPic: accName, reportPicProfileId: raw.accountingPicProfileId });
    }
    rows.push(raw);
  }
  return rows;
}
