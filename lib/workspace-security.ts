type Row = Record<string, any>;
const annualAccountingMonthFields = ["technicalAdminMonths", "dataMonths", "reportPreparationMonths"] as const;

export function validateAnnualAccountingMonths(row: Row) {
  for (const field of annualAccountingMonthFields) {
    const months = row[field];
    if (months === undefined) continue; // Historical rows predate these checklists.
    if (!Array.isArray(months) || months.some(month => !Number.isInteger(month) || month < 0 || month > 11) || new Set(months).size !== months.length) {
      throw new Error(`Invalid ${field}: expected unique month indexes 0-11.`);
    }
  }
}
const feeFields = new Set(["serviceFee", "annualFee", "monthlyFee", "monthly_fee", "annual_fee"]);
const identityFields = ["id", "annualWorkId", "databaseId", "clientId", "client_id", "clientCode", "clientName", "name", "taxPic", "accountingPic", "taxPicProfileId", "accountingPicProfileId", "tax_pic_profile_id", "accounting_pic_profile_id", "taxPicSnapshotProfileId", "accountingPicSnapshotProfileId", "taxPicSnapshot", "accountingPicSnapshot", "generatedAt", "generatedByProfileId", "generatedByName", "month", "year"];

export function clientIdentifier(row: Row) {
  return String(row.databaseId || row.clientId || row.client_id || row.clientCode || row.clientName || row.name || "").trim();
}

export function annualRowIdentifier(row: Row) {
  return String(row.annualWorkId || row.id || clientIdentifier(row)).trim();
}

function canAccessAnnualRow(row: Row, profileId: string, allowed: Set<string>) {
  if (row.annualWorkId) return [row.accountingPicProfileId, row.taxPicProfileId, row.reportPicProfileId].includes(profileId);
  return allowed.has(clientIdentifier(row));
}

export function redactFees(value: any): any {
  if (Array.isArray(value)) return value.map(redactFees);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !feeFields.has(key)).map(([key, item]) => [key, redactFees(item)]));
}

export function canAccessMonthlyRow(row: Row, profileId: string, allowed: Set<string>) {
  const snapshots = [row.taxPicSnapshotProfileId, row.accountingPicSnapshotProfileId].filter(Boolean);
  const owners = snapshots.length ? snapshots : [row.taxPicProfileId, row.accountingPicProfileId, row.tax_pic_profile_id, row.accounting_pic_profile_id].filter(Boolean);
  return owners.length ? owners.includes(profileId) : allowed.has(clientIdentifier(row));
}

export function scopedWorkspace(scope: string, payload: any, allowed: Set<string>, profileId: string, leadership: boolean): any {
  if (leadership) return payload;
  const filter = (rows: any) => Array.isArray(rows) ? rows.filter(row => row && typeof row === "object" && (scope === "monthly_compliance" ? canAccessMonthlyRow(row, profileId, allowed) : canAccessAnnualRow(row, profileId, allowed))) : [];
  return redactFees(scope === "monthly_compliance"
    ? Object.fromEntries(Object.entries(payload || {}).map(([period, rows]) => [period, filter(rows)]))
    : filter(payload));
}

// Absence from a scoped browser payload is never an instruction to delete history.
export function mergeWorkspace(scope: string, current: any, incoming: any, allowed: Set<string>, profileId: string, leadership: boolean): any {
  const mergeRows = (stored: any, submitted: any) => {
    if (!Array.isArray(submitted)) throw new Error("Workspace rows must be an array.");
    const rows: Row[] = Array.isArray(stored) ? structuredClone(stored) : [];
    const seen = new Set<string>();
    for (const next of submitted) {
      if (!next || typeof next !== "object" || Array.isArray(next)) throw new Error("Invalid workspace row.");
      const key = scope === "monthly_compliance" ? clientIdentifier(next) : annualRowIdentifier(next);
      if (!key || seen.has(key)) throw new Error("Missing or duplicate client identity.");
      seen.add(key);
      const index = rows.findIndex(row => (scope === "monthly_compliance" ? clientIdentifier(row) : annualRowIdentifier(row)) === key);
      const previous = index >= 0 ? rows[index] : null;
      if (scope !== "monthly_compliance" && next.annualWorkId) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(next.annualWorkId))) throw new Error("Invalid annual work ID.");
        if (!leadership && ![next.accountingPicProfileId, next.taxPicProfileId, next.reportPicProfileId].some(Boolean)) throw new Error("Assign an annual PIC before saving.");
        if (!leadership && !previous && [next.accountingPicProfileId, next.taxPicProfileId, next.reportPicProfileId].some(id => id && id !== profileId)) throw new Error("Only leadership can assign other PICs to new annual work.");
      }
      if (!leadership && !(scope === "monthly_compliance"
        ? previous ? canAccessMonthlyRow(previous, profileId, allowed) : allowed.has(key)
        : previous ? canAccessAnnualRow(previous, profileId, allowed) : next.annualWorkId ? canAccessAnnualRow(next, profileId, allowed) : allowed.has(clientIdentifier(next)))) throw new Error("An annual row is outside your assigned scope.");
      if (scope === "monthly_compliance" && !previous) throw new Error("Generate this client period before editing it.");
      const candidate = { ...previous, ...(leadership ? next : redactFees(next)) };
      if (scope === "annual_accounting") validateAnnualAccountingMonths(candidate);
      if (previous) {
        for (const field of identityFields) {
          if (scope !== "monthly_compliance" && ["clientName", "name", "taxPic", "accountingPic", "taxPicProfileId", "accountingPicProfileId"].includes(field)) continue;
          if (field in previous) candidate[field] = previous[field];
          else delete candidate[field];
        }
        if (!leadership && scope !== "monthly_compliance" && previous.annualWorkId) {
          for (const field of ["accountingPicProfileId", "taxPicProfileId", "reportPicProfileId", "accountingPic", "taxPic", "reportPic"]) candidate[field] = previous[field];
        }
      } else if (!leadership) {
        for (const field of identityFields.filter(field => /ProfileId|_profile_id|Snapshot|generated/.test(field))) delete candidate[field];
      }
      if (index >= 0) rows[index] = candidate;
      else rows.push(candidate);
    }
    return rows;
  };
  if (scope !== "monthly_compliance") return mergeRows(current, incoming);
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("Monthly workspace must contain periods.");
  const result = { ...(current || {}) };
  for (const [period, rows] of Object.entries(incoming)) {
    if (["__proto__", "constructor", "prototype"].includes(period)) throw new Error("Invalid period.");
    result[period] = mergeRows(result[period], rows);
  }
  return result;
}
