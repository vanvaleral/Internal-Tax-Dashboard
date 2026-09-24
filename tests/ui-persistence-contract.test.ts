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

test("Monthly Compliance inputs accept database UUID row identifiers", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /\^ob-\(\.\+\)-\(pph21\|unifikasi\|pph25\|phrpb1\|ppn\)-\(payable\|date\|ntpn\|detail\)\$/);
  assert.doesNotMatch(demo, /\^ob-\(client-\\d\+\)-\(pph21\|unifikasi\|pph25\|phrpb1\|ppn\)-\(payable\|date\|ntpn\|detail\)\$/);
  assert.match(demo, /if \(fieldKey === "ntpn"\) \{\s*updateLedgerField\(clientId, obligationKey, fieldKey, target\.value, false\);/);
});

test("Settings exposes per-device Web Push controls", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /navigator\.serviceWorker\.register\("\/push-sw\.js"/);
  assert.match(demo, /Notification\.requestPermission\(\)/);
  assert.match(demo, /data-toggle-push-notifications="yes"/);
  assert.match(demo, /\/api\/push-subscriptions/);
});

test("the client and case lists use windowed table rendering", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /function windowedRows\(rows, tableId, rowHeight\)/);
  assert.match(demo, /state\.tableViewport\[tableId\] = start/);
  assert.match(demo, /data-virtual-table="active-clients"/);
  assert.match(demo, /data-virtual-table="cases"/);
  assert.match(demo, /function restoreVirtualTableScrollPositions\(\)/);
  assert.match(demo, /Math\.min\(Number\(state\.virtualScrollTop\[tableId\] \|\| 0\), maximum\)/);
  assert.match(demo, /"client-management-view", "allocation-view", "cases-view"/);
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

test("KPI Overview counts only active Client Master records", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /const activePortfolioClients = clientMasterClients\.filter\(\(client\) => client\.clientStatus !== "Inactive"\)/);
  assert.match(demo, /const activeCount = activePortfolioClients\.length/);
  assert.match(demo, /const activeMonthlyFeeBase = activePortfolioClients\.reduce/);
  assert.match(demo, /const assignedClients = activePortfolioClients\.filter/);
  assert.doesNotMatch(demo, /const activeCount = clients\.length/);
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
  assert.match(demo, /\["client-management-view", "allocation-view", "cases-view"\]\.includes\(state\.currentView\)/);
});

test("Allocation combines ACC PIC and Tax PIC dropdown filters", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /id="allocation-acc-filter"/);
  assert.match(demo, /id="allocation-tax-filter"/);
  assert.match(demo, /state\.allocationAccFilter !== "all" && client\.accountingPic !== state\.allocationAccFilter/);
  assert.match(demo, /state\.allocationTaxFilter !== "all" && client\.taxPic !== state\.allocationTaxFilter/);
  assert.match(demo, /allocationAccFilter: state\.allocationAccFilter/);
  assert.match(demo, /allocationTaxFilter: state\.allocationTaxFilter/);
});

test("Allocation separates company form from the client name", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /<th>Form<\/th>\s*<th>Client Name<\/th>/);
  assert.match(demo, /escapeHtml\(identity\.form \|\| "Individual"\)/);
  assert.match(demo, /virtualSpacer\(8, allocationWindow\.top\)/);
  assert.match(demo, /compareText\(leftIdentity\.form, rightIdentity\.form\)/);
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
  assert.match(demo, /const showMyWorkDetail = Boolean\(selected && state\.myWorkDetailOpen\)/);
  assert.match(demo, /data-close-my-work-detail="yes"/);
  assert.match(demo, /class="my-work-detail-close" data-close-my-work-detail="yes"/);
  assert.match(demo, /\.my-work-detail-close \{ position:absolute; top:12px; right:14px;/);
  assert.match(demo, /state\.myWorkDetailOpen = true/);
  assert.match(demo, /topbar-actions \.ghost-btn\.inbox-trigger \{\s*display: none;/);
});

test("My Work separates current completions from a compact monthly archive browser", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /data-my-work-tab="current"/);
  assert.match(demo, /data-my-work-tab="archived"/);
  assert.match(demo, /data-toggle-my-work-completed="yes"/);
  assert.match(demo, /data-open-my-work-archive-period=/);
  assert.match(demo, /data-close-my-work-archive-period=/);
  assert.match(demo, /id="my-work-archive-year"/);
  assert.match(demo, /id="my-work-archive-search"/);
  assert.match(demo, /data-export-my-work-archive=/);
  assert.match(demo, /const selectedArchiveGroup = archiveGroups\.find/);
  assert.match(demo, /Number\(task\.completedAt \|\| 0\) < archiveThreshold\.getTime\(\)/);
  assert.match(demo, /date\.toLocaleDateString\("id-ID", \{ month: "long", year: "numeric" \}\)/);
});

test("My Work demo mode previews every task section without touching shared data", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /pageParams\.get\("demo"\) === "my-work"/);
  assert.match(demo, /makeTask\("demo-active-1"/);
  assert.match(demo, /makeTask\("demo-completed-1"/);
  assert.match(demo, /makeTask\("demo-archive-1"/);
  assert.match(demo, /Preview data · not saved/);
  assert.match(demo, /async function loadSharedMyWork\(background = false\) \{\s*if \(myWorkDemoMode\) return;/);
  assert.match(demo, /function saveMyWorkTaskToDatabase\(task, extra = \{\}\) \{\s*if \(myWorkDemoMode\) return;/);
  assert.match(demo, /myWork: myWorkDemoMode \? \[\] : state\.myWork/);
});

test("My Work returns to a full-width list when moving from mobile to desktop", async () => {
  const demo = await readFile(demoPath, "utf8");
  assert.match(demo, /\.my-work-panel\.has-detail \{ grid-template-columns:/);
  assert.match(demo, /myWorkMobileViewport\.addEventListener\("change"/);
  assert.match(demo, /if \(event\.matches \|\| state\.currentView !== "my-work-view"\) return;\s*state\.myWorkDetailOpen = false;/);
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
