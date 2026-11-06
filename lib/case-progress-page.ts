type Cursor = { at: string | null; id: string } | null | false;
export type CaseProgressCursor = Record<"completedTasks" | "progressEntries" | "taskTimeline", Cursor>;
const sources = ["completedTasks", "progressEntries", "taskTimeline"] as const;
export function parseCaseProgressPage(params: URLSearchParams) {
  const limit = params.has("limit") ? Number(params.get("limit")) : 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Choose a history page size from 1 to 100.");
  const raw = params.get("cursor");
  if (raw && raw.length > 2000) throw new Error("Invalid history cursor.");
  const input = raw ? JSON.parse(raw) : {};
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !(sources as readonly string[]).includes(key))) throw new Error("Invalid history cursor.");
  const cursor = {} as CaseProgressCursor;
  for (const source of sources) {
    const value = input[source];
    if (value === undefined || value === null || value === false) { cursor[source] = value === false ? false : null; continue; }
    if (!value || Object.keys(value).some(key => !["at", "id"].includes(key)) || value.at !== null && (typeof value.at !== "string" || !/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value.at) || !Number.isFinite(Date.parse(value.at))) || typeof value.id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.id)) throw new Error("Invalid history cursor.");
    // Preserve Postgres microseconds; Date.toISOString() would truncate them.
    cursor[source] = { at: value.at, id: value.id.toLowerCase() };
  }
  return { limit, cursor };
}
export function applyCaseProgressPage(query: any, field: string, cursor: Cursor, limit: number) {
  if (cursor === false) return Promise.resolve({ data: [], error: null });
  if (cursor) query = cursor.at === null ? query.is(field, null).lt("id", cursor.id) : query.or(`${field}.lt.${cursor.at},${field}.is.null,and(${field}.eq.${cursor.at},id.lt.${cursor.id})`);
  return query.order(field, { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(limit + 1);
}
export function caseProgressPage(rows: any[], field: string, limit: number) {
  const data = rows.slice(0, limit), last = data[data.length - 1];
  const cursor: Cursor = rows.length > limit ? { at: last[field] ?? null, id: last.id } : false;
  return { data, cursor };
}
