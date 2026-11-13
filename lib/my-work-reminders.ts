/** New reminder writes must carry an explicit timezone; never let PostgreSQL guess. */
export function reminderInstant(value: unknown): string | null {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Choose a valid reminder date and time.");
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) throw new Error("Refresh the dashboard and set the reminder again so its timezone is included.");
  const [, y, m, d, hh, mm, ss = "0", zone] = match;
  const calendar = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (calendar.getUTCFullYear() !== Number(y) || calendar.getUTCMonth() !== Number(m) - 1 || calendar.getUTCDate() !== Number(d)
    || Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59
    || zone !== "Z" && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59 || Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0)) {
    throw new Error("Choose a valid reminder date and time.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid reminder date and time.");
  return date.toISOString();
}
