// Only reviewed, non-data UI files may bypass session/database checks.
const PUBLIC_UI_ASSETS = new Set([
  "/favicon.svg",
  "/favicon-options/option-a-diamond.svg",
  "/favicon-options/option-b-monogram.svg",
  "/favicon-options/option-c-orbit.svg",
  "/images/lmats-logo-source.png",
  "/images/lmats-logo-official.png",
  "/images/wall-of-fame-viking-male.png",
  "/images/wall-of-fame-viking-female.png",
  "/vendor/purify.min.js",
  "/vendor/xlsx.full.min.js",
  "/workspace-sync.js",
  "/submenu-tabs.css",
  "/claim-values.js",
  "/push-sw.js",
  "/client-overview.css",
  "/startup-orbit.css",
  "/annual-accounting-dashboard-preview.css",
  "/annual-accounting-sheet-demo.css",
  "/annual-sheet-live.js",
  "/annual-sheet-dashboard.js",
  "/annual-sheet-dashboard.css"
]);

export function isPublicUiAsset(pathname: string, method: string) {
  // HTML and renderers containing embedded client/staff demo fixtures remain protected.
  return (method === "GET" || method === "HEAD") && PUBLIC_UI_ASSETS.has(pathname);
}
