import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const demo = fs.readFileSync(path.join(root, "public", "demo.html"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "clients", "allocation", "route.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "202609240002_client_pic_allocation_history.sql"), "utf8");
const canonicalLabelsMigration = fs.readFileSync(path.join(root, "supabase", "migrations", "202609240003_canonical_staff_labels.sql"), "utf8");

test("allocation history stores yearly before and after PIC identities", () => {
  assert.match(migration, /create table if not exists public\.client_pic_allocation_history/);
  assert.match(migration, /allocation_year integer not null/);
  for (const field of ["previous_tax_pic_profile_id", "next_tax_pic_profile_id", "previous_accounting_pic_profile_id", "next_accounting_pic_profile_id", "changed_by_profile_id"]) {
    assert.match(migration, new RegExp(field));
  }
});

test("allocation batch updates client master and history atomically", () => {
  assert.match(migration, /create or replace function public\.apply_client_pic_allocation_batch/);
  assert.match(migration, /insert into public\.client_pic_allocation_history/);
  assert.match(migration, /update public\.client_master set/);
  assert.match(migration, /'pic_allocation_changed'/);
  assert.match(migration, /grant execute on function public\.apply_client_pic_allocation_batch[\s\S]*to service_role/);
  assert.match(route, /actor\.admin\.rpc\("apply_client_pic_allocation_batch"/);
});

test("allocation API enforces leadership and permanent staff identity", () => {
  assert.match(route, /if \(!isLeadership\(actor\.profile\.role\)\)/);
  assert.match(route, /Tax PIC must match one active staff profile/);
  assert.match(route, /ACC PIC must match one active staff profile/);
  assert.match(route, /p_changed_by_profile_id: actor\.profile\.id/);
});

test("Allocation UI applies one year-tagged batch from Client Master", () => {
  assert.match(demo, /allocationYear: Number\(/);
  assert.match(demo, /id="allocation-year"/);
  assert.match(demo, /function allocationRows\(\) \{[\s\S]*?return sortClientMasterRows\(activeClientMasterRecords\(\)/);
  assert.match(demo, /fetch\("\/api\/clients\/allocation"|appFetch\("\/api\/clients\/allocation"/);
  assert.match(demo, /allocationYear: state\.allocationYear/);
  assert.doesNotMatch(demo, /Promise\.all\(report\.map\(\(change\) => saveClientToDatabase/);
});

test("Allocation canonicalizes legacy PIC capitalization by permanent profile ID", () => {
  assert.match(demo, /await loadStaffDirectory\(background\)/);
  assert.match(demo, /clientMasterClients\.forEach/);
  assert.match(demo, /canonicalStaffName\(client\.taxPic, client\.taxPicProfileId\)/);
  assert.match(route, /staffLabelById\.get\(taxIds\[0\]\) \|\| taxName/);
  assert.match(canonicalLabelsMigration, /where client\.tax_pic_profile_id = staff\.id/);
  assert.match(canonicalLabelsMigration, /where client\.accounting_pic_profile_id = staff\.id/);
});

function allocationApi(role = "supervisor", extraStaff: any[] = []) {
  const calls: any[] = [];
  const actor = { userId:"user-1", profile:{ id:"supervisor-1", role }, admin:{
    from(table: string) {
      const result = { data:table === "client_master" ? [{ id:"client-1", client_code:"CL-00001" }] : [
        { id:"tax-1", display_name:"Bagus", full_name:"Bagus Tax" },
        { id:"acc-1", display_name:"Ivan", full_name:"Ivan Accounting" }, ...extraStaff
      ], error:null };
      return { select() { return this; }, in: async () => result, eq: async () => result };
    },
    async rpc(name: string, args: any) { calls.push({ name, args }); return { data:1, error:null }; }
  } };
  const context = { exports:{} as Record<string, any>, require(name: string) {
    if (name === "next/server") return { NextResponse:{ json:(body: any, options: any = {}) => ({ body, status:options.status || 200 }) } };
    if (name === "@/lib/access") return { currentActor:async () => actor, isLeadership:(value: string) => ["supervisor", "leader", "partner", "admin"].includes(value) };
    if (name === "@/lib/client-import") return { asSafeText:(value: unknown) => String(value ?? "").trim() };
    throw new Error(`Unexpected dependency: ${name}`);
  } };
  vm.runInNewContext(ts.transpileModule(route, { compilerOptions:{ module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText, context);
  const apply = (changes: any) => context.exports.POST({ json:async () => ({ allocationYear:2026, changes }) });
  return { apply, calls };
}

test("Allocation can clear Accounting PIC while retaining Tax PIC and the atomic yearly audit path", async () => {
  const d = allocationApi();
  const result = await d.apply([{ clientCode:"CL-00001", nextTaxPic:"BAGUS", nextAccPic:"" }]);
  assert.equal(result.status, 200); assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0].name, "apply_client_pic_allocation_batch");
  assert.equal(d.calls[0].args.p_allocation_year, 2026);
  assert.equal(d.calls[0].args.p_changed_by_profile_id, "supervisor-1");
  const change = d.calls[0].args.p_changes[0];
  assert.equal(change.tax_pic_profile_id, "tax-1"); assert.equal(change.tax_pic_name, "Bagus");
  assert.equal(change.accounting_pic_profile_id, null); assert.equal(change.accounting_pic_name, null);
  assert.match(migration, /accounting_pic_profile_id = nullif\(change->>'accounting_pic_profile_id', ''\)::uuid/);
  assert.match(migration, /accounting_pic_name = nullif\(change->>'accounting_pic_name', ''\)/);
});

test("explicit No PIC is nullable for either assignment and is never stored as a staff name", async () => {
  const d = allocationApi();
  assert.equal((await d.apply([{ clientCode:"CL-00001", nextTaxPic:null, nextAccPic:"Ivan" }])).status, 200);
  assert.equal(d.calls[0].args.p_changes[0].tax_pic_profile_id, null);
  assert.equal(d.calls[0].args.p_changes[0].tax_pic_name, null);
  assert.equal(d.calls[0].args.p_changes[0].accounting_pic_profile_id, "acc-1");
  assert.equal((await d.apply([{ clientCode:"CL-00001", nextTaxPic:"", nextAccPic:null }])).status, 200);
  const change = d.calls[1].args.p_changes[0];
  assert.equal(change.tax_pic_profile_id, null); assert.equal(change.accounting_pic_profile_id, null);
  assert.equal(change.tax_pic_name, null); assert.equal(change.accounting_pic_name, null);
});

test("Allocation rejects omitted PICs, invalid names and non-leadership without writing", async () => {
  const d = allocationApi();
  for (const changes of [[{ clientCode:"CL-00001", nextAccPic:"" }], [{ clientCode:"CL-00001", nextTaxPic:"Bagus" }], [null], [{ clientCode:"CL-00001", nextTaxPic:17, nextAccPic:"" }]]) {
    assert.equal((await d.apply(changes)).status, 400);
  }
  for (const change of [{ clientCode:"CL-00001", nextTaxPic:"Bagus", nextAccPic:"Unknown" }, { clientCode:"CL-00001", nextTaxPic:"No PIC", nextAccPic:"Ivan" }]) {
    assert.equal((await d.apply([change])).status, 422);
  }
  assert.equal(d.calls.length, 0);
  const staff = allocationApi("staff");
  assert.equal((await staff.apply([{ clientCode:"CL-00001", nextTaxPic:"Bagus", nextAccPic:"" }])).status, 403);
  assert.equal(staff.calls.length, 0);
  const duplicate = allocationApi("supervisor", [{ id:"acc-other", display_name:"Ivan", full_name:"Another Ivan" }]);
  assert.equal((await duplicate.apply([{ clientCode:"CL-00001", nextTaxPic:"Bagus", nextAccPic:"Ivan" }])).status, 422);
  assert.equal(duplicate.calls.length, 0);
});
