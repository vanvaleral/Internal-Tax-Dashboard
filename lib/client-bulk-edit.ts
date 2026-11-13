import { asSafeText, normalizeImportedDate, normalizeNpwp } from "./client-import.ts";

type BulkField = { key: string; label: string; group: string; type: string; options?: string[]; required?: boolean; max?: number };
export const CLIENT_BULK_FIELDS: BulkField[] = [
  { key: "legal_name", label: "Client name", group: "details", type: "text", required: true, max: 255 },
  { key: "company_form", label: "Form", group: "details", type: "select", options: ["", "PT", "CV", "FA", "BUT", "UD", "Firma", "Yayasan", "Koperasi", "Individual"] },
  { key: "npwp", label: "NPWP", group: "details", type: "npwp" },
  { key: "industry", label: "Industry", group: "details", type: "text", max: 300 },
  { key: "address", label: "Address", group: "details", type: "text", max: 2000 },
  { key: "tax_office_region", label: "Tax office", group: "details", type: "text", max: 300 },
  { key: "notes", label: "Notes", group: "details", type: "text", max: 4000 },
  { key: "monthly_fee", label: "Monthly fee (Rp)", group: "commercial", type: "amount" },
  { key: "annual_fee", label: "Annual fee (Rp)", group: "commercial", type: "amount" },
  { key: "contract_started_at", label: "Contract start", group: "commercial", type: "date" },
  { key: "contract_signed_at", label: "Contract signed", group: "commercial", type: "date" },
  { key: "engagement_start", label: "Engagement start", group: "commercial", type: "date" },
  { key: "engagement_end", label: "Engagement end", group: "commercial", type: "date" },
  { key: "service_package", label: "Service package", group: "commercial", type: "text", max: 300 },
  ...[["has_pph21", "PPh 21"], ["has_unifikasi", "Unifikasi"], ["has_pph25_pp55", "PPh 25 / PP55"], ["has_pb1", "PHR / PB1"], ["has_ppn", "PPN"]].map(([key, label]) => ({ key, label, group: "obligations", type: "boolean" }))
];
export const CLIENT_BULK_COLUMNS = [...new Set(["id", "client_code", "status", "engagement_type", "tax_pic_name", "accounting_pic_name", "tax_pic_profile_id", "accounting_pic_profile_id", "updated_at", ...CLIENT_BULK_FIELDS.map(field => field.key)])].join(", ");

function fieldValue(field: BulkField, value: unknown) {
  if (field.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${field.label} must be checked or unchecked.`);
    return value;
  }
  if (value !== null && typeof value !== "string" && !(field.type === "amount" && typeof value === "number")) throw new Error(`${field.label} has an invalid value type.`);
  const text = asSafeText(value);
  if (field.type === "amount") {
    if (text && !/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(text)) throw new Error(`${field.label} must be a non-negative whole-rupiah amount.`);
    const amount = Number(text.replaceAll(".", ""));
    if (!Number.isSafeInteger(amount)) throw new Error(`${field.label} is too large.`);
    return amount;
  }
  if (field.type === "date") {
    if (!text) return null;
    const date = normalizeImportedDate(text);
    if (!date) throw new Error(`${field.label} must be a valid dd/mm/yyyy date.`);
    return date;
  }
  if (field.type === "npwp") {
    if (text && !/^[\d.\s-]+$/.test(text)) throw new Error("NPWP can contain only digits and separators.");
    const npwp = normalizeNpwp(text);
    if (npwp && !/^\d{15,16}$/.test(npwp)) throw new Error("NPWP must contain 15 or 16 digits.");
    return npwp || null;
  }
  if (field.required && !text) throw new Error(`${field.label} is required.`);
  if (text.length > (field.max || 300)) throw new Error(`${field.label} is too long.`);
  if (/^[=+@]/.test(text)) throw new Error(`${field.label} cannot start with a formula character.`);
  if (field.options && !field.options.includes(text)) throw new Error(`Choose a valid ${field.label}.`);
  return text || null;
}

export function parseClientBulkChanges(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 500) throw new Error("Edit between 1 and 500 clients per save.");
  const seen = new Set<string>();
  return value.map(row => {
    if (!row || typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) || seen.has(row.id) || typeof row.expectedUpdatedAt !== "string" || !row.expectedUpdatedAt) throw new Error("Refresh the clients before editing; client IDs and versions are required.");
    seen.add(row.id);
    if (!row.changes || typeof row.changes !== "object" || Array.isArray(row.changes) || !Object.keys(row.changes).length) throw new Error("Each selected client needs at least one changed field.");
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row.changes)) {
      const field = CLIENT_BULK_FIELDS.find(field => field.key === key);
      if (!field) throw new Error("That field cannot be bulk edited. Use Allocation for PICs and the existing client actions for status/category changes.");
      changes[key] = fieldValue(field, value);
    }
    return { id: row.id, expectedUpdatedAt: row.expectedUpdatedAt, changes };
  });
}
