import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STAFF_ACCESS_RETENTION_DAYS = 14;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server database access is not configured." }, { status: 503 });
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.rpc("purge_deleted_items");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const staffCutoff = new Date(Date.now() - STAFF_ACCESS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: expired, error: staffError } = await admin.from("staff_profiles")
    .select("id, auth_user_id, archived_at, access_deletion_started_at")
    .eq("directory_active", false).not("archived_at", "is", null)
    .is("access_deleted_at", null).lte("archived_at", staffCutoff)
    .order("archived_at").limit(100);
  if (staffError) return NextResponse.json({ error: staffError.message }, { status: 500 });

  let deletedStaffAccess = 0;
  let failedStaffAccess = 0;
  for (const profile of expired || []) {
    if (!profile.access_deletion_started_at) {
      const { data: claimed, error: claimError } = await admin.from("staff_profiles")
        .update({ access_deletion_started_at: new Date().toISOString() })
        .eq("id", profile.id).eq("directory_active", false).eq("archived_at", profile.archived_at)
        .is("access_deleted_at", null).is("access_deletion_started_at", null)
        .select("id").maybeSingle();
      if (claimError || !claimed) {
        if (claimError) failedStaffAccess += 1;
        continue;
      }
    }
    if (profile.auth_user_id) {
      const { error: authError } = await admin.auth.admin.deleteUser(profile.auth_user_id);
      if (authError && authError.status !== 404) {
        failedStaffAccess += 1;
        console.error("[staff retention] Auth deletion failed", profile.id, authError);
        continue;
      }
    }
    const { data: completed, error: completionError } = await admin.from("staff_profiles")
      .update({ auth_user_id: null, username: null, claim_code_hash: null, access_deleted_at: new Date().toISOString() })
      .eq("id", profile.id).eq("directory_active", false).eq("archived_at", profile.archived_at)
      .is("access_deleted_at", null).not("access_deletion_started_at", "is", null)
      .select("id").maybeSingle();
    if (completionError || !completed) {
      failedStaffAccess += 1;
      console.error("[staff retention] Finalization failed", profile.id, completionError);
      continue;
    }
    deletedStaffAccess += 1;
  }
  return NextResponse.json({ ok: failedStaffAccess === 0, purgedBefore: cutoff, staffAccessExpiredBefore: staffCutoff, deletedStaffAccess, failedStaffAccess }, { status: failedStaffAccess ? 500 : 200 });
}
