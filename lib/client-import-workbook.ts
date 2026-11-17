import * as XLSX from "xlsx";
import { CLIENT_IMPORT_DATE_FIELDS, normalizeImportedDate } from "./client-import.ts";

const DATE_FIELDS = new Set<string>(CLIENT_IMPORT_DATE_FIELDS);

export function clientImportWorkbookRows(workbook: XLSX.WorkBook): Record<string, unknown>[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const columns = new Map<string, number>();
  for (let c = range.s.c; c <= range.e.c; c++) {
    const field = String(sheet[XLSX.utils.encode_cell({ r: range.s.r, c })]?.v ?? "");
    if (DATE_FIELDS.has(field) && !columns.has(field)) columns.set(field, c);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  for (const row of rows) for (const [field, c] of columns) {
    // SheetJS retains the physical row number even when blank rows are skipped.
    const cell = sheet[XLSX.utils.encode_cell({ r: row.__rowNum__ as number, c })];
    if (!cell) continue;
    if (cell.f) { row[field] = `=${cell.f}`; continue; }
    if (cell.t !== "n" || !XLSX.SSF.is_date(cell.z || "")) continue;
    // Decode the actual calendar date, not locale-dependent display text (e.g. 1/1/26).
    const date = XLSX.SSF.parse_date_code(cell.v, { date1904 });
    const iso = date && normalizeImportedDate(`${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`);
    row[field] = iso || `Invalid Excel date (${String(cell.v)})`;
  }
  return rows;
}
