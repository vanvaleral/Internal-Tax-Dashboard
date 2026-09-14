export function uniqueProfileIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

export function notificationEventKey(sourceType: string, sourceId: string, action = "created") {
  return `${sourceType}:${sourceId}:${action}`;
}

export function calculateHimbauanDueDate(receivedDate: string | null | undefined) {
  const value = String(receivedDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 14);
  return date.toISOString().slice(0, 10);
}
