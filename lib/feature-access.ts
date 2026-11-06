export const FEATURES = [
  ["operations", "Operations"], ["cases", "Cases"], ["myWork", "My Work"],
  ["clients", "Clients"], ["management", "Management"], ["allocation", "Allocation"],
  ["notifications", "Notifications"], ["profile", "Profile"]
] as const;
export type Feature = typeof FEATURES[number][0];
export const ACCESS_MODES = ["hidden", "enabled", "preview", "maintenance"] as const;
export type FeatureMode = typeof ACCESS_MODES[number];
export type AccessTier = "associate" | "leader";
export type FeatureRule = { mode: FeatureMode; message: string };
export type FeaturePolicy = Record<AccessTier, Record<Feature, FeatureRule>>;
export type FeatureSettings = { policy: FeaturePolicy; version: number; ready: boolean };

export function canManageAccess(role: string | null | undefined) {
  return ["supervisor", "partner", "admin"].includes(String(role || "").toLowerCase());
}
export function accessTier(role: string | null | undefined): AccessTier {
  return role === "leader" ? "leader" : "associate";
}
export function defaultFeaturePolicy(): FeaturePolicy {
  const defaults = () => Object.fromEntries(FEATURES.map(([id]) => [id, {
    mode: ["operations", "management", "allocation"].includes(id) ? "hidden" : "enabled", message: ""
  }])) as Record<Feature, FeatureRule>;
  return { associate: defaults(), leader: defaults() };
}
export function parseFeaturePolicy(input: unknown): FeaturePolicy {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid access settings.");
  const value = input as Record<string, any>, result = defaultFeaturePolicy();
  if (Object.keys(value).some(key => !["associate", "leader"].includes(key))) throw new Error("Unknown access level.");
  for (const tier of ["associate", "leader"] as const) {
    if (!value[tier] || Object.keys(value[tier]).length !== FEATURES.length) throw new Error("Include every menu for both access levels.");
    for (const [feature] of FEATURES) {
      const rule = value[tier][feature];
      if (!rule || typeof rule !== "object" || Object.keys(rule).some(key => !["mode", "message"].includes(key)) || !ACCESS_MODES.includes(rule.mode) || typeof rule.message !== "string" || rule.message.length > 400) throw new Error("Choose a valid mode and a notice up to 400 characters.");
      if (feature === "profile" && rule.mode !== "enabled") throw new Error("Profile must stay available for account settings and recovery.");
      if (["preview", "maintenance"].includes(rule.mode) && !rule.message.trim()) throw new Error("Add a notice for preview or maintenance features.");
      result[tier][feature] = { mode: rule.mode, message: rule.message.trim() };
    }
  }
  return result;
}
export function featureRule(role: string, policy: FeaturePolicy, feature: Feature): FeatureRule {
  return canManageAccess(role) ? { mode: "enabled", message: "" } : policy[accessTier(role)][feature];
}
export function canUseFeature(role: string, policy: FeaturePolicy, feature: Feature) {
  return ["enabled", "preview"].includes(featureRule(role, policy, feature).mode);
}
export const VIEW_FEATURES: Record<string, Feature> = {
  "matrix-view": "operations", "cases-view": "cases", "my-work-view": "myWork", "client-view": "clients",
  "client-management-view": "clients", "dashboard-view": "management", "allocation-view": "allocation",
  "announcement-view": "notifications", "profile-view": "profile"
};
export function allowedView(role: string, policy: FeaturePolicy, view: string) {
  if (VIEW_FEATURES[view] && canUseFeature(role, policy, VIEW_FEATURES[view])) return view;
  return ["my-work-view", "cases-view", "client-management-view", "profile-view"].find(id => canUseFeature(role, policy, VIEW_FEATURES[id])) || "profile-view";
}

// Reads of shared picklists/Client Master remain scoped by their existing APIs.
// A visible menu never grants new editing, financial-data or ownership privileges.
export function requiredRequestFeature(path: string, method: string): Feature | "access-admin" | null {
  if (path === "/api/feature-access") return method === "GET" ? null : "access-admin";
  if (/^\/api\/staff(?:\/|$)/.test(path)) return method !== "GET" ? "access-admin" : null;
  if (/^\/api\/clients\/allocation(?:\/|$)/.test(path)) return "allocation";
  if (path === "/api/operations" || path === "/api/annual-sheet" || path === "/api/monthly-claims") return "operations";
  if (/^\/api\/cases(?:\/|$)/.test(path)) return "cases";
  if (path === "/api/my-work") return "myWork";
  if (path === "/api/announcements" || path === "/api/push-subscriptions") return "notifications";
  if (path === "/api/performance") return method === "GET" ? null : "management";
  if (/^\/api\/clients(?:\/|$)/.test(path)) return path === "/api/clients" && method === "GET" ? null : "clients";
  return null;
}
export function requestAccessError(role: string, policy: FeaturePolicy, path: string, method: string) {
  const feature = requiredRequestFeature(path, method);
  if (feature === "access-admin") return canManageAccess(role) ? null : "Only a Supervisor or Partner can manage PIC Access.";
  if (!feature || canUseFeature(role, policy, feature)) return null;
  const rule = featureRule(role, policy, feature);
  return rule.mode === "maintenance" ? rule.message || "This feature is temporarily unavailable." : "This feature is not enabled for your access level.";
}
export async function readFeatureSettings(client: { from: (table: string) => any }): Promise<FeatureSettings> {
  const { data, error } = await client.from("feature_access_settings").select("policy, version").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) throw new Error("Feature access settings could not be verified.");
  if (!data) return { policy: defaultFeaturePolicy(), version: 0, ready: false };
  return { policy: parseFeaturePolicy(data.policy), version: data.version, ready: true };
}
