import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const demoPath = new URL("../public/demo.html", import.meta.url);

test("client overview uses the master identity and only linked operational records", async () => {
  const source = await readFile(demoPath, "utf8");
  const start = source.indexOf("    function renderClientView() {");
  const end = source.indexOf("    function triggerPointsBurst(", start);
  assert.ok(start >= 0 && end > start);
  const root = { innerHTML: "" };
  const master = { id: "client-1", databaseId: "db-1", name: "PT Alpha", clientCode: "CL-1", clientStatus: "Active", taxPic: "Ita", accountingPic: "Ivan" };
  const obligations = Object.fromEntries(["pph21", "unifikasi", "pph25", "phrpb1", "ppn"].map((key) => [key, { status: key === "pph21" ? "awaiting" : "na" }]));
  const context = {
    document: { getElementById: () => root },
    state: { selectedClientId: "client-1", activeMonthlyPeriod: "September 2026", monthlyProgress: { "September 2026": [{ id: "client-1", databaseId: "db-1", name: "PT Alpha", taxPic: "Ita", dataState: "missing", obligations, lastUpdated: "2026-09-24 09:00" }] }, myWork: [] },
    clientMasterClients: [master], clients: [], annualAccountingRows: [], annualTaxRows: [],
    taxCases: [{ id: "case-1", clientId: "client-1", clientName: "PT Alpha", caseType: "Himbauan", dueDate: "2020-01-01", taxPic: "Ita" }, { id: "case-other", clientId: "client-2", clientName: "PT Alpha", caseType: "Pemeriksaan", dueDate: "2020-01-01" }],
    casesLoadedFromDatabase: true, IS_OFFLINE_DEMO: false, operationalScopesLoaded: new Set(["monthly_compliance", "annual_accounting", "annual_tax"]),
    OBLIGATIONS: ["pph21", "unifikasi", "pph25", "phrpb1", "ppn"], OBLIGATION_LABELS: { pph21: "PPh 21" },
    DATA_STATE_META: { missing: { label: "Data missing" } },
    hasLeadershipAccess: () => true, isAssignedToAnnualRow: () => true,
    isActiveClientRecord: (client: typeof master) => client.clientStatus === "Active",
    clientDataState: (client: { dataState: string }) => client.dataState,
    obligationLedgerState: (item: { status: string }) => item.status === "na" ? "na" : "idle",
    activeObligationKeys: () => ["pph21"],
    normalizedEntityName: (value: string) => String(value || "").toLowerCase(),
    escapeHtml: (value: unknown) => String(value ?? ""), currency: (value: number) => String(value), safeHtml: (value: string) => value
  };
  runInNewContext(`${source.slice(start, end)}\nrenderClientView();`, context);
  assert.match(root.innerHTML, /Request client data/);
  assert.match(root.innerHTML, /1 open · 0 closed/);
  assert.match(root.innerHTML, /Monthly record updated/);
  assert.doesNotMatch(root.innerHTML, /Pemeriksaan/);
  assert.doesNotMatch(root.innerHTML, /Folder created|Operational Benefits/);

  master.clientStatus = "Inactive";
  runInNewContext(`${source.slice(start, end)}\nrenderClientView();`, context);
  assert.match(root.innerHTML, /Inactive client archive/);
  assert.doesNotMatch(root.innerHTML, /Request client data/);
});
