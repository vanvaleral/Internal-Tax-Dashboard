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
    for (const [field, value] of Object.entries(row)) {
      if (typeof value === "string" && FORMULA_PREFIX.test(value.trim())) errors.push(`${field} cannot start with an Excel formula character.`);
    }
    validations.push({ row: index + 2, clientCode, errors });
  });
  return validations;
}
