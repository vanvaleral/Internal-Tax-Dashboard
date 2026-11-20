import assert from "node:assert/strict";
import test from "node:test";
import { loadRoute, mockDatabase, request } from "./route-harness.ts";

const id = "11111111-1111-4111-8111-111111111111";
const timestamp = "2026-11-20T01:02:03.456789Z";
const rows = [
  { id, client_code: "CL-012", legal_name: "Deleted client", status: "Deleted", updated_at: timestamp },
  { id: "inactive", client_code: "CL-013", legal_name: "Inactive client", status: "Inactive" },
  { id: "active", client_code: "CL-014", legal_name: "Active client", status: "Active" }
];

function fixture(role = "supervisor") {
  const admin = mockDatabase({ client_master: structuredClone(rows) });
  const actor = { admin, userId: "signed-in", profile: { id: "actor-profile", role } };
  const calls: any[] = [];
  admin.rpc = async (name, args) => {
    calls.push({ name, args });
    return args.p_expected_updated_at === timestamp
      ? { data: { id, status: args.p_deleted ? "Deleted" : "Inactive" }, error: null }
      : { data: null, error: { code: "40001", message: "Refresh the list and try again." } };
  };
  const route = loadRoute("app/api/clients/trash/route.ts", { "@/lib/access": { currentActor: async () => actor } });
  const { readClients } = loadRoute("lib/workspace-reads.ts", { "@/lib/access": { isLeadership: () => true } });
  return { route, readClients, actor, calls };
}

test("Deleted Clients is separate from the normal register, and only eligible roles can access it", async () => {
  const { route, readClients, actor } = fixture();
  const trash = await route.GET(request());
  assert.equal(trash.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(Array.from(trash.body.data, (row: any) => row.id), [id]);
  assert.deepEqual(Array.from((await readClients(actor)).data, (row: any) => row.id), ["inactive", "active"]);
  for (const role of ["leader", "staff"]) {
    const { route, calls } = fixture(role);
    assert.equal((await route.GET(request())).status, 403);
    assert.equal((await route.PATCH(request({ id, updatedAt: timestamp, action: "restore" }))).status, 403);
    assert.equal(calls.length, 0);
  }
});

test("delete and restore use the signed-in actor and preserve the full concurrency timestamp", async () => {
  const { route, calls } = fixture("partner");
  assert.equal((await route.PATCH(request({ id, action: "delete" }))).status, 400);
  assert.equal((await route.PATCH(request({ id, action: "purge", updatedAt: timestamp }))).status, 400);
  assert.equal(calls.length, 0);
  for (const action of ["delete", "restore"]) {
    const response = await route.PATCH(request({ id, action, updatedAt: timestamp, actor: "injected" }));
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, action === "delete" ? "Deleted" : "Inactive");
    assert.equal(calls.at(-1).name, "set_client_master_deleted");
    assert.equal(calls.at(-1).args.p_expected_updated_at, timestamp);
    assert.equal(calls.at(-1).args.p_actor_user_id, "signed-in");
    assert.equal(calls.at(-1).args.p_actor_profile_id, "actor-profile");
  }
  assert.equal((await route.PATCH(request({ id, action: "delete", updatedAt: "2026-11-01T00:00:00Z" }))).status, 409);
});
