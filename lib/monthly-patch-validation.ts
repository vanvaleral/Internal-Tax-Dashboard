const rowFields = new Set(["dataState", "followUpCount", "lastUpdated", "notes", "claimStatus", "paymentStatus"]);
const obligationFields = new Set(["status", "payableAmount", "paidDate", "paidDateDraft", "receiptNumber", "taxBreakdown", "requestedAt", "reported", "quickNotes", "revisionRequired"]);
const obligationKeys = new Set(["pph21", "unifikasi", "pph25", "phrpb1", "ppn"]);
const obligationStatuses = new Set(["done", "awaiting", "temporary", "revision", "missing", "na"]);
const dataStates = new Set(["missing", "requesting", "received"]);
const claimStatuses = new Set(["Draft", "Billing Ready", "Claim Generated", "Sent to Client", "Payment Received", "Tax Paid", "Reported"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.length <= maxLength;
}

function validField(field: string, value: unknown, obligation: boolean) {
  if (field === "status") return obligationStatuses.has(String(value));
  if (field === "dataState") return dataStates.has(String(value));
  if (field === "claimStatus") return claimStatuses.has(String(value));
  if (field === "followUpCount") return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1000000;
  if (field === "payableAmount") return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1000000000000000;
  if (["reported", "revisionRequired"].includes(field)) return typeof value === "boolean";
  if (field === "notes") return validText(value, 20000);
  if (["quickNotes", "taxBreakdown"].includes(field)) return validText(value, 5000);
  if (field === "receiptNumber") return validText(value, 250);
  if (field === "paymentStatus") return validText(value, 100);
  if (field === "lastUpdated") return validText(value, 64);
  if (["paidDate", "paidDateDraft", "requestedAt"].includes(field)) return validText(value, 64);
  return !obligation && rowFields.has(field);
}

export function validateMonthlyPatch(changes: unknown): asserts changes is Record<string, unknown> {
  if (!isRecord(changes) || !Object.keys(changes).length) throw new Error("Monthly changes must be a nonempty object.");
  for (const [field, value] of Object.entries(changes)) {
    if (field !== "obligations") {
      if (!rowFields.has(field) || !validField(field, value, false)) throw new Error(`Invalid monthly field: ${field}.`);
      continue;
    }
    if (!isRecord(value) || !Object.keys(value).length) throw new Error("Obligation changes must be a nonempty object.");
    for (const [key, fields] of Object.entries(value)) {
      if (!obligationKeys.has(key) || !isRecord(fields) || !Object.keys(fields).length) throw new Error(`Invalid obligation: ${key}.`);
      for (const [name, nextValue] of Object.entries(fields)) {
        if (!obligationFields.has(name) || !validField(name, nextValue, true)) throw new Error(`Invalid obligation field: ${name}.`);
      }
    }
  }
}
