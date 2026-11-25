import { currentActor, isLeadership } from "@/lib/access";
import { canManageAccess, canUseFeature, readFeatureSettings } from "@/lib/feature-access";

export function canOverseeCases(profile: {role: string; employment_title?: string | null}) {
  return isLeadership(profile.role) || (profile.role === "staff" &&
    /^senior (?:tax |accounting )?associate$/i.test((profile.employment_title || "").trim().replace(/\s+/g," ")));
}

// Cases handlers own all identity checks; middleware delegates only these exact APIs.
export async function currentCaseActor(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor || canManageAccess(actor.profile.role)) return actor;
  try {
    const settings = await readFeatureSettings(actor.admin);
    if (!canUseFeature(actor.profile.role, settings.policy, "cases")) return { error: "Cases is not enabled for your access level.", status: 403 as const };
    return actor;
  } catch { return { error: "Case access could not be verified. Please retry.", status: 503 as const }; }
}
