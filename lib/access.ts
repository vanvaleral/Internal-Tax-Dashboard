import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type StaffRole = "staff" | "leader" | "supervisor" | "partner" | "admin";

export type CurrentActor = {
  userId: string;
  profile: {
    id: string;
    full_name: string;
    display_name: string | null;
    username: string | null;
    team_division: string | null;
    role: StaffRole;
  };
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
};

export function isLeadership(role: string | null | undefined) {
  return ["leader", "supervisor", "partner", "admin"].includes(String(role || "").toLowerCase());
}

export async function currentActor(): Promise<CurrentActor | { error: string; status: 401 | 403 | 503 }> {
  const session = await createClient();
  if (!session) return { error: "Database is not configured.", status: 503 };
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: "Authentication is required.", status: 401 };

  const admin = createAdminClient();
  if (!admin) return { error: "Server database access is not configured.", status: 503 };
  const { data: profile, error } = await admin
    .from("staff_profiles")
    .select("id, full_name, display_name, username, team_division, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error || !profile) return { error: error?.message || "Staff profile was not found.", status: 403 };

  return { userId: user.id, profile: { ...profile, role: String(profile.role || "staff").toLowerCase() as StaffRole }, admin };
}
