type CaseRow = { id: string; client_name: string; case_category: string; created_at: string; closed_at?: string; deleted_at?: string; stage?: string; tax_pic_profile_id?: string; accounting_pic_profile_id?: string; case_workflow?: { removedProgress?: Array<{ id: string; at: string; restoredAt?: string }> } };
type Person = { id: string; display_name?: string; full_name: string; directory_active?: boolean };
export type ReportEvent = { id: string; case_id?: string; pic?: string; at: string; kind: "follow-up" | "task" | "step"; text?: string; timelineOnly?: boolean };

export function monthBounds(period: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period)) return null;
  const [year, month] = period.split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start: `${period}-01T00:00:00+08:00`, end: `${endDate}T00:00:00+08:00`, endDate };
}

export const reportMonth = (now = new Date()) => new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 7);
const profileName = (person?: Person) => person?.display_name || person?.full_name || "Unknown PIC";

export function buildMonthlyLeadershipReport(period: string, cases: CaseRow[], people: Person[], input: ReportEvent[]) {
  const bounds = monthBounds(period);
  if (!bounds) throw new Error("Invalid report month.");
  const start = Date.parse(bounds.start), end = Date.parse(bounds.end);
  const records = new Map(cases.filter(row => Date.parse(row.created_at) < end).map(row => [row.id, row]));
  const directory = new Map(people.map(person => [person.id, person]));
  const byPIC = new Map<string, { id: string; name: string; followUps: number; tasks: number; steps: number; lastUpdate: string }>();
  const updates = new Map<string, ReportEvent[]>();
  const events = input.filter(event => Date.parse(event.at) >= start && Date.parse(event.at) < end)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
  let unattributed = 0;
  for (const event of events) {
    const row = event.case_id ? records.get(event.case_id) : undefined;
    if (event.case_id && !row) continue;
    if (event.kind === "follow-up" && row?.case_workflow?.removedProgress?.some(removal => removal.id === event.id &&
      Date.parse(removal.at) < end && (!removal.restoredAt || Date.parse(removal.restoredAt) >= end))) continue;
    if (event.timelineOnly) {
      // The separate task ledger already counts this completion.
    } else if (event.pic) {
      const pic = byPIC.get(event.pic) || { id: event.pic, name: profileName(directory.get(event.pic)), followUps: 0, tasks: 0, steps: 0, lastUpdate: event.at };
      if (event.kind === "follow-up") pic.followUps++;
      else if (event.kind === "task") pic.tasks++;
      else pic.steps++;
      byPIC.set(event.pic, pic);
    } else unattributed++;
    if (event.case_id) {
      const list = updates.get(event.case_id) || [];
      list.push(event);
      updates.set(event.case_id, list);
    }
  }
  const caseRows = Array.from(records.values()).flatMap(row => {
    const closed = Boolean(row.closed_at && row.closed_at < bounds.endDate);
    const archived = Boolean(row.deleted_at && Date.parse(row.deleted_at) < end);
    const inMonth = updates.get(row.id) || [];
    if ((closed || archived) && !inMonth.length && Date.parse(row.created_at) < start && !(row.closed_at && row.closed_at >= period + "-01" && closed)) return [];
    return [{ id: row.id, client: row.client_name, category: row.case_category,
      state: archived ? "Archived" : closed ? "Closed" : row.stage === "Closed" && !row.closed_at ? "Closure date unknown" : "Open",
      updates: inMonth.length, latest: inMonth[0] ? { at: inMonth[0].at, name: profileName(directory.get(inMonth[0].pic || "")), text: inMonth[0].text || "" } : null }];
  });
  return { period, staff: Array.from(byPIC.values()).sort((a, b) => a.name.localeCompare(b.name)), cases: caseRows, unattributed };
}

export function followUpWatch(now: Date, cases: CaseRow[], people: Person[], events: ReportEvent[]) {
  const threshold = now.getTime() - 30 * 86400000;
  const cutoff = now.getTime();
  const byCasePIC = new Map<string, number>();
  const active = new Map(cases.map(row => [row.id, row]));
  for (const event of events) {
    const row = active.get(event.case_id || ""), date = Date.parse(event.at);
    if (!row || !event.pic || !Number.isFinite(date) || date >= cutoff) continue;
    if (event.kind === "follow-up" && row.case_workflow?.removedProgress?.some(item => item.id === event.id && !item.restoredAt)) continue;
    const key = row.id + ":" + event.pic;
    byCasePIC.set(key, Math.max(date, byCasePIC.get(key) || 0));
  }
  const directory = new Map(people.filter(person => person.directory_active === true).map(person => [person.id, person]));
  const rows = new Map<string, { name: string; open: number; stale: number; recent: string | null; staleClients: string[] }>();
  for (const row of cases) {
    if (row.stage === "Closed" || row.closed_at || row.deleted_at || Date.parse(row.created_at) >= cutoff) continue;
    for (const id of new Set([row.tax_pic_profile_id, row.accounting_pic_profile_id])) {
      if (!id || !directory.has(id)) continue;
      const pic = rows.get(id) || { name: profileName(directory.get(id)), open: 0, stale: 0, recent: null, staleClients: [] };
      const last = byCasePIC.get(row.id + ":" + id);
      pic.open++;
      if (last && (!pic.recent || last > Date.parse(pic.recent))) pic.recent = new Date(last).toISOString();
      if (Date.parse(row.created_at) <= threshold && (!last || last <= threshold)) {
        pic.stale++;
        if (pic.staleClients.length < 5) pic.staleClients.push(row.client_name);
      }
      rows.set(id, pic);
    }
  }
  return Array.from(rows.values()).filter(row => row.stale).sort((a, b) => b.stale - a.stale || a.name.localeCompare(b.name));
}
