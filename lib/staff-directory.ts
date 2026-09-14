import type { StaffRole } from "@/lib/access";

export const STAFF_DIRECTORY_ROLES = ["staff", "leader", "supervisor", "partner", "admin"] as const;
export const STAFF_DIRECTORY_TEAMS = ["Tax Team", "Accounting Team"] as const;

export function isStaffDirectoryRole(value: string): value is StaffRole {
  return (STAFF_DIRECTORY_ROLES as readonly string[]).includes(value);
}

export function canImportClientMaster(role: string | null | undefined) {
  return ["leader", "supervisor"].includes(String(role || "").toLowerCase());
}

/** Partners retain final control over Partner/Admin identities. */
export function canManageDirectoryRole(actorRole: StaffRole, targetRole: StaffRole, nextRole: StaffRole) {
  if (["partner", "admin"].includes(actorRole)) return true;
  if (!["leader", "supervisor"].includes(actorRole)) return false;
  return !["partner", "admin"].includes(targetRole) && !["partner", "admin"].includes(nextRole);
}
