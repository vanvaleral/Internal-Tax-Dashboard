import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const demoPath = new URL("../public/demo.html", import.meta.url);

test("My Work uses a per-task save queue and avoids stale full-record replacement", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const myWorkSaveQueues = new WeakMap\(\)/);
  assert.match(demo, /rapid create \+ edit sequence into POST then PATCH/);
  assert.doesNotMatch(demo, /Object\.assign\(task, result\.task\)/);
  assert.doesNotMatch(demo, /if \(creating\) saveMyWorkTaskToDatabase\(task\)/);
  assert.match(demo, /if \(task\.pendingSync\) saveMyWorkTaskToDatabase\(task\)/);
  assert.match(demo, /typeof task\.pendingFavorite === "boolean"/);
});

test("inline case edits are debounced and keep the table in place", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const inlineCaseSaveQueues = new WeakMap\(\)/);
  assert.match(demo, /window\.setTimeout\(\(\) => \{/);
  assert.match(demo, /saveCaseToDatabase\(record, \{ showLoading: false \}\)/);
  assert.match(demo, /}, 250\);/);
});

test("case autosave resolves ownership from Client Master instead of an Operations snapshot", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /function findCaseClient\([\s\S]*?\.\.\.clientMasterClients, \.\.\.clients/);
  assert.match(demo, /clientId: record\.databaseClientId \|\| linkedClient\?\.databaseId \|\| null/);
  assert.match(demo, /const linkedClient = findCaseClient\(\{ clientName: record\.clientName \}\)/);
});

test("Monthly Compliance payable input does not append decimal zeroes while typing", async () => {
  const demo = await readFile(demoPath, "utf8");
  const formatter = demo.match(/function formatRupiahInput\(value\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(formatter, /maximumFractionDigits: 0/);
  assert.doesNotMatch(formatter, /minimumFractionDigits/);
  assert.match(demo, /payableAmount\)\}" placeholder="0"/);
});

test("the client and case lists use windowed table rendering", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /function windowedRows\(rows, tableId, rowHeight\)/);
  assert.match(demo, /data-virtual-table="active-clients"/);
  assert.match(demo, /data-virtual-table="cases"/);
});

test("Clients provides PIC filtering and an autosaving obligation quick panel", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /clientPicFilter: persistedDemoState\?\.ui\?\.clientPicFilter \|\| "all"/);
  assert.match(demo, /id="active-client-pic-filter"/);
  assert.match(demo, /client\.taxPic === state\.clientPicFilter \|\| client\.accountingPic === state\.clientPicFilter/);
  assert.match(demo, /data-client-master-toggle=/);
  assert.match(demo, /data-client-obligation=/);
  assert.match(demo, /saveClientToDatabase\(client, \{ showLoading: false \}\)/);
  assert.match(demo, /!hasLeadershipAccess\(\)/);
});

test("Client Growth normalizes KPP labels before calculating regional distribution", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /function normalizeTaxOfficeRegion\(value\)/);
  assert.match(demo, /\["denpasar timur", "Denpasar Timur"\]/);
  assert.match(demo, /normalizeTaxOfficeRegion\(client\.taxOfficeRegion\) === region/);
});

test("Client Growth uses Client Master and includes active clients without a precise contract date", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const growthClients = clientMasterClients/);
  assert.match(demo, /year === currentYear\s+\? growthClients\.filter\(\(client\) => client\.clientStatus !== "Inactive"\)/);
});

test("Profile client scope uses Client Master and permanent PIC profile IDs", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const assignedClients = clientMasterClients\.filter/);
  assert.match(demo, /client\.taxPicProfileId \|\| ""/);
  assert.match(demo, /client\.accountingPicProfileId \|\| ""/);
  assert.match(demo, /PIC TAX & PIC ACC/);
});

test("Monthly Compliance saves changed fields per client and preserves the active queue during client refresh", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const monthlyRowSaveQueues = new Map\(\)/);
  assert.match(demo, /method: "PATCH"/);
  assert.match(demo, /JSON\.stringify\(\{ period, rowId, changes \}\)/);
  assert.match(demo, /state\.activeMonthlyPeriod && state\.monthlyProgress\[state\.activeMonthlyPeriod\]/);
  assert.doesNotMatch(demo, /function saveMonthlyProgress\(\) \{[\s\S]{0,260}queueWorkspaceSave\("monthly_compliance"/);
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

test("non-Operations UI changes never enqueue an Operations workspace save", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.doesNotMatch(demo, /if \(state\.currentView === "matrix-view" && state\.operationsMode === "monthly"/);
  assert.match(demo, /if \(state\.currentView === "matrix-view" && state\.operationsMode === "annual"/);
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
  assert.match(demo, /const MOBILE_WORKSPACE_VIEWS = new Set\(\["my-work-view", "cases-view", "client-management-view", "client-view", "profile-view", "announcement-view"\]\)/);
  assert.match(demo, /data-view="matrix-view" data-mobile-hidden="yes"/);
  assert.match(demo, /data-view="announcement-view" aria-label="Open notifications"/);
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
  assert.match(demo, /topbar-actions \.ghost-btn\.inbox-trigger \{\s*display: none;/);
});

test("announcement inbox can be toggled without leaving the current workspace", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /if \(openAnnouncementInboxTrigger\) \{\s*state\.announcementInboxOpen = !state\.announcementInboxOpen;/);
  assert.match(demo, /height: calc\(100svh - 190px\)/);
  assert.match(demo, /mobile-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24">/);
  assert.match(demo, /settings-btn[\s\S]{0,360}<svg viewBox="0 0 24 24">/);
});

test("mobile navigation is a persistent composited layer", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /position: fixed !important;/);
  assert.match(demo, /z-index: 1000;/);
  assert.match(demo, /bottom: calc\(8px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(demo, /transform: translate3d\(0, 0, 0\);/);
});

test("mobile alerts open a full notifications workspace instead of an inbox popover", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /function renderAnnouncementView\(\)/);
  assert.match(demo, /<section id="announcement-view" class="view hidden"><\/section>/);
  assert.match(demo, /if \(state\.currentView === "announcement-view"\) return renderAnnouncementView\(\);/);
  assert.match(demo, /if \(state\.currentView === "announcement-view"\) renderAnnouncementView\(\);/);
});

test("mobile header keeps attendance and custom icons centered", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /database-status-chip[\s\S]*mobile-attendance-trigger[\s\S]*settings-btn[\s\S]*logout-btn/);
  assert.match(demo, /\.topbar-actions \.ghost-btn\.inbox-trigger \{\s*display: none;/);
  assert.match(demo, /\.topbar-actions \.mobile-attendance-trigger \{[\s\S]{0,320}place-items: center;/);
  assert.match(demo, /\.topbar-actions \.ghost-btn \{[\s\S]{0,320}display: grid;[\s\S]{0,320}place-items: center;[\s\S]{0,320}line-height: 0;/);
  assert.match(demo, /\.workspace-cases \.case-mobile-actions \.solid-btn \{[\s\S]{0,360}display: grid;[\s\S]{0,360}place-items: center;/);
  assert.match(demo, /client-fab[\s\S]{0,520}<svg viewBox="0 0 24 24" aria-hidden="true">/);
});
