export type ClientImportRow = Record<string, unknown>;

export type ImportValidation = {
  row: number;
  clientCode: string;
  errors: string[];
};

const FORMULA_PREFIX = /^[=+\-@]/;

export function asSafeText(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeNpwp(value: unknown) {
  return asSafeText(value).replace(/[^0-9]/g, "");
}

/** Converts a year-only Excel value into a valid date for PostgreSQL. */
export function normalizeImportedDate(value: unknown) {
  const source = asSafeText(value);
  if (!source) return null;
  if (/^\d{4}$/.test(source)) return `${source}-01-01`;

  let year = 0;
  let month = 0;
  let day = 0;
  let match = source.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) [year, month, day] = match.slice(1).map(Number);
  else {
    match = source.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!match) return null;
    [day, month, year] = match.slice(1).map(Number);
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function validateClientImportRows(rows: ClientImportRow[]) {
  const seenCodes = new Set<string>();
  const validations: ImportValidation[] = [];
  rows.forEach((row, index) => {
    const clientCode = asSafeText(row.clientCode);
    const name = asSafeText(row.name);
    const errors: string[] = [];
    if (!clientCode) errors.push("Client code is required.");
    if (!name) errors.push("Client name is required.");
    if (clientCode && seenCodes.has(clientCode.toLowerCase())) errors.push("Duplicate client code in this file.");
    if (clientCode) seenCodes.add(clientCode.toLowerCase());
    const npwp = normalizeNpwp(row.npwp);
    if (asSafeText(row.npwp) && (npwp.length < 15 || npwp.length > 16)) errors.push("NPWP must contain 15 or 16 digits.");
    for (const field of ["contractStartedAt", "inactivatedAt", "engagementStart", "engagementEnd"]) {
      if (asSafeText(row[field]) && !normalizeImportedDate(row[field])) errors.push(`${field} must be a year or a valid date.`);
    }
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === "string" && FORMULA_PREFIX.test(value.trim())) errors.push(`${field} cannot start with an Excel formula character.`);
    }
    validations.push({ row: index + 2, clientCode, errors });
  });
  return validations;
}
