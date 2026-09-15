import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demoPath = new URL("../public/demo.html", import.meta.url);

test("My Work uses a per-task save queue and avoids stale full-record replacement", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const myWorkSaveQueues = new WeakMap\(\)/);
  assert.match(demo, /rapid create \+ edit sequence into POST then PATCH/);
  assert.doesNotMatch(demo, /Object\.assign\(task, result\.task\)/);
});

test("inline case edits are debounced and keep the table in place", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const inlineCaseSaveQueues = new WeakMap\(\)/);
  assert.match(demo, /window\.setTimeout\(\(\) => \{/);
  assert.match(demo, /saveCaseToDatabase\(record, \{ showLoading: false \}\)/);
});

test("the client and case lists use windowed table rendering", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /function windowedRows\(rows, tableId, rowHeight\)/);
  assert.match(demo, /data-virtual-table="active-clients"/);
  assert.match(demo, /data-virtual-table="cases"/);
});

test("Client Growth normalizes KPP labels before calculating regional distribution", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /function normalizeTaxOfficeRegion\(value\)/);
  assert.match(demo, /\["denpasar timur", "Denpasar Timur"\]/);
  assert.match(demo, /normalizeTaxOfficeRegion\(client\.taxOfficeRegion\) === region/);
});

test("Monthly Compliance saves only changed periods and preserves the active queue during client refresh", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /\[state\.activeMonthlyPeriod\]: state\.monthlyProgress\[state\.activeMonthlyPeriod\]/);
  assert.match(demo, /operationalPendingPayloads\[scope\] = \{ \.\.\.\(operationalPendingPayloads\[scope\] \|\| \{\}\), \.\.\.structuredClone\(payload\) \}/);
  assert.match(demo, /state\.activeMonthlyPeriod && state\.monthlyProgress\[state\.activeMonthlyPeriod\]/);
  assert.match(demo, /\.\.\.\(operationalPendingPayloads\.monthly_compliance \|\| \{\}\)/);
});

test("client master load surfaces failed syncs and does not retain sample records for an empty database response", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /throw new Error\(result\.error \|\| `Client master could not be loaded/);
  assert.match(demo, /clearSyncFailure\("Client master"\)/);
  assert.match(demo, /markSyncFailure\("Client master", error\)/);
  assert.doesNotMatch(demo, /const rows = Array\.isArray\(result\.data\) \? result\.data : \[\];\s*if \(!rows\.length\) return;/);
});

test("client master is not restored from browser storage after a shared-data save fails", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /if \(\["clients", "proposals"\]\.includes\(key\)\) return deepClone\(fallback\);/);
  assert.doesNotMatch(demo, /collections: \{\s*clients,\s*proposals,/);
  assert.match(demo, /const previousClient = structuredClone\(client\);/);
  assert.match(demo, /Object\.assign\(client, previousClient\);/);
});

test("sub-menu navigation uses the complete renderer without triggering an autosave", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /function commitWorkspaceNavigation\(mode = "push"\) \{\s*rerender\(\);\s*persistDemoState\(\);/);
  assert.doesNotMatch(demo, /function commitWorkspaceNavigation\(mode = "push"\) \{[\s\S]{0,240}saveMonthlyProgress\(/);
});

test("allocation uses virtual rows and does not build the hidden mobile layout on desktop", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const allocationWindow = windowedRows\(rows, "allocation-clients", 48\)/);
  assert.match(demo, /data-virtual-table="allocation-clients"/);
  assert.match(demo, /\$\{!isMobileLayout \? `<div class="table-wrap"/);
  assert.match(demo, /\["client-management-view", "allocation-view"\]\.includes\(state\.currentView\)/);
});

test("mobile navigation is limited to operational companion workspaces", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const MOBILE_WORKSPACE_VIEWS = new Set\(\["my-work-view", "cases-view", "client-management-view", "client-view", "profile-view"\]\)/);
  assert.match(demo, /data-view="matrix-view" data-mobile-hidden="yes"/);
  assert.match(demo, /data-open-announcement-inbox="yes" aria-label="Open notifications"/);
  assert.match(demo, /!isMobileWorkspace && canImportClientMaster\(\)/);
  assert.match(demo, /mobile-nav-icon/);
  assert.match(demo, /mobile-nav-label">My Work/);
});

test("mobile workspace keeps the header, cases controls, and client list compact", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /workspace-cases \.case-mobile-tabs/);
  assert.match(demo, /workspace-clients \.client-fab[\s\S]{0,160}bottom: 104px/);
  assert.match(demo, /client-mobile-row/);
  assert.doesNotMatch(demo, /client-mobile-card[\s\S]{0,1800}obligationStripMarkup\(client\)/);
  assert.match(demo, /topbar-mobile-icon/);
  assert.match(demo, /z-index: 100/);
});

test("mobile My Work opens details only after selecting a task", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /myWorkDetailOpen: false/);
  assert.match(demo, /const showMyWorkDetail = Boolean\(selected && \(!isMobileMyWork \|\| state\.myWorkDetailOpen\)\)/);
  assert.match(demo, /data-close-my-work-detail="yes"/);
  assert.match(demo, /state\.myWorkDetailOpen = true/);
  assert.match(demo, /topbar-actions \.inbox-trigger \{\s*display: none;/);
});

test("announcement inbox can be toggled without leaving the current workspace", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /if \(openAnnouncementInboxTrigger\) \{\s*state\.announcementInboxOpen = !state\.announcementInboxOpen;/);
  assert.match(demo, /height: calc\(100dvh - 190px\)/);
});
