import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute, mockDatabase } from "./route-harness.ts";

test("annual handler authenticates once, checks active staff and rejects account changes without trusting request headers", async () => {
  let user: any = { id: "signed-in-user" }, calls = 0;
  const db = mockDatabase({ staff_profiles: [{ id: "pic-1", auth_user_id: "signed-in-user", full_name: "PIC", directory_active: true, role: "staff" }] });
  const access = loadRoute("lib/access.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => { calls++; return { data: { user } }; } } }) },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/staff-directory": { canImportClientMaster: () => false }
  });
  const request = (userId = "signed-in-user") => new Request("http://test.local/api/annual-sheet", { headers: { "x-workspace-user": userId } });
  assert.equal((await access.currentActor(request())).userId, "signed-in-user"); assert.equal(calls, 1);
  assert.equal((await access.currentActor(request("forged-other-user"))).status, 409);
  db.tables.staff_profiles[0].directory_active = false;
  assert.equal((await access.currentActor(request())).status, 403);
  user = null;
  assert.equal((await access.currentActor(request())).status, 401);
});
