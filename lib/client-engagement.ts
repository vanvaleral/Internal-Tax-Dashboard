export const ENGAGEMENT_TYPES = ["contract", "on_demand"] as const;
export type EngagementType = typeof ENGAGEMENT_TYPES[number];
export function engagementType(value: unknown): EngagementType {
  return value === "on_demand" ? "on_demand" : "contract";
}
export function validateEngagementChange(body: any) {
  if (!ENGAGEMENT_TYPES.includes(body?.engagementType)) throw new Error("Choose Contract or On Demand.");
  if (!Array.isArray(body?.clients) || !body.clients.length || body.clients.length > 500) throw new Error("Select 1 to 500 clients.");
  const seen = new Set<string>();
  return body.clients.map((row: any) => {
    if (!row || typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) || seen.has(row.id) || !ENGAGEMENT_TYPES.includes(row.beforeType)) throw new Error("Refresh the selected clients before moving them.");
    seen.add(row.id); return { id: row.id, before_type: row.beforeType };
  });
}
