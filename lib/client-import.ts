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

export function normalizeClientIdentityName(value: unknown) {
  return asSafeText(value)
    .toLowerCase()
    .replace(/^(pt|cv|fa|but|ud|firma|yayasan|koperasi)\.?\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type DuplicateClientCandidate = { id?: string; clientCode: string; name: string; npwp?: string | null; createdAt?: string | null };

export function findDuplicateClientGroups(rows: DuplicateClientCandidate[]) {
  const groups = new Map<string, { key: string; reason: "NPWP" | "name"; clients: DuplicateClientCandidate[] }>();
  for (const row of rows) {
    const npwp = normalizeNpwp(row.npwp);
    const name = normalizeClientIdentityName(row.name);
    const key = npwp.length >= 15 ? `npwp:${npwp}` : name ? `name:${name}` : "";
    if (!key) continue;
    const reason: "NPWP" | "name" = key.startsWith("npwp:") ? "NPWP" : "name";
    const group = groups.get(key) || { key, reason, clients: [] };
    group.clients.push(row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.clients.length > 1)
    .map((group) => ({ ...group, clients: [...group.clients].sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")) || left.clientCode.localeCompare(right.clientCode)) }));
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

export function validateClientImportRows(rows: ClientImportRow[], { allowMissingCodes = false } = {}) {
  const seenCodes = new Set<string>();
  const seenIdentityKeys = new Set<string>();
  const validations: ImportValidation[] = [];
  rows.forEach((row, index) => {
    const clientCode = asSafeText(row.clientCode);
    const name = asSafeText(row.name);
    const errors: string[] = [];
    if (!clientCode && !allowMissingCodes) errors.push("Client code is required.");
    if (!name) errors.push("Client name is required.");
    if (Object.hasOwn(row, "clientStatus") && !["Active", "Inactive", "Proposal", "Contract"].includes(asSafeText(row.clientStatus))) errors.push("clientStatus must be Active, Inactive, Proposal or Contract.");
    for (const field of ["monthlyFee", "serviceFee", "annualFee"]) {
      if (asSafeText(row[field]) && !Number.isFinite(Number(row[field]))) errors.push(`${field} must be a number without currency symbols or separators.`);
    }
    if (clientCode && seenCodes.has(clientCode.toLowerCase())) errors.push("Duplicate client code in this file.");
    if (clientCode) seenCodes.add(clientCode.toLowerCase());
    const npwp = normalizeNpwp(row.npwp);
    if (asSafeText(row.npwp) && (npwp.length < 15 || npwp.length > 16)) errors.push("NPWP must contain 15 or 16 digits.");
    const form = asSafeText(row.businessForm || name.match(/^(pt|cv|fa|but|ud|firma|yayasan|koperasi)\.?\s+/i)?.[1]).replace(/[.\s]/g, "").toLowerCase();
    const identityKey = npwp.length >= 15 ? `npwp:${npwp}` : `name:${normalizeClientIdentityName(name)}:${form}`;
    if (identityKey !== "name:" && seenIdentityKeys.has(identityKey)) errors.push("Possible duplicate client identity in this file.");
    if (identityKey !== "name:") seenIdentityKeys.add(identityKey);
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

// Only fields present in the uploaded file may replace existing values.
export function clientImportPayload(row: ClientImportRow, fullPayload: ClientImportRow) {
  const fields: Record<string, string[]> = {
    client_code: ["clientCode"], legal_name: ["name"], npwp: ["npwp"], company_form: ["businessForm"],
    industry: ["industry"], address: ["address"], status: ["clientStatus"],
    tax_pic_name: ["taxPic"], tax_pic_profile_id: ["taxPic"], accounting_pic_name: ["accountingPic"], accounting_pic_profile_id: ["accountingPic"],
    partner_name: ["partner"], partner_profile_id: ["partner"], supervisor_name: ["supervisor"], supervisor_profile_id: ["supervisor"],
    monthly_fee: ["monthlyFee", "serviceFee"], annual_fee: ["annualFee"], engagement_start: ["engagementStart"], engagement_end: ["engagementEnd"],
    contract_started_at: ["contractStartedAt"], contract_signed_at: ["contractSignedAt"], inactivated_at: ["inactivatedAt"],
    tax_office_region: ["taxOfficeRegion"], notes: ["notes"], service_package: ["servicePackage"], proposal_status: ["proposalStatus"],
    responsible_person_name: ["responsiblePersonName"], responsible_person_birth_place: ["responsiblePersonBirthPlace"],
    responsible_person_birth_date: ["responsiblePersonBirthDate"], responsible_person_address: ["responsiblePersonAddress"],
    notary_name: ["notaryName"], notary_address: ["notaryAddress"], deed_number: ["deedNumber"], deed_date: ["deedDate"]
  };
  const payload = Object.fromEntries(Object.entries(fields)
    .filter(([, keys]) => keys.some((key) => Object.hasOwn(row, key)))
    .map(([field]) => [field, fullPayload[field]]));
  for (const [input, output] of Object.entries({ pph21: "has_pph21", unifikasi: "has_unifikasi", pph25: "has_pph25_pp55", phrpb1: "has_pb1", ppn: "has_ppn" })) {
    if (Object.hasOwn(row, input)) payload[output] = /^(true|yes|y|1|x|ya)$/i.test(asSafeText(row[input]));
    else if (Object.hasOwn(row, "obligations")) payload[output] = fullPayload[output];
  }
  return payload;
}
