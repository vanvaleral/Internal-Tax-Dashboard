const { createHash } = require("node:crypto");

const style = `html,body{margin:0;background:#f0f2ee}
.workspace-boot{position:fixed;inset:0;z-index:1;display:grid;place-content:center;justify-items:center;gap:14px;background:#f0f2ee;color:#35575d;font:13px "Segoe UI",sans-serif}
.workspace-boot[hidden]{display:none}
.workspace-boot[data-revealing]{opacity:0;visibility:hidden;pointer-events:none}
.workspace-bars{display:flex;align-items:flex-end;gap:5px;height:30px}
.workspace-bars i{display:block;width:5px;height:12px;border-radius:2px;background:#0891a6;transform-origin:bottom;animation:workspace-pulse 1.1s ease-in-out infinite}
.workspace-bars i:nth-child(2){height:18px;animation-delay:120ms}.workspace-bars i:nth-child(3){height:24px;animation-delay:240ms}.workspace-bars i:nth-child(4){height:30px;animation-delay:360ms}
@keyframes workspace-pulse{0%,100%{transform:scaleY(.6);opacity:.45}50%{transform:scaleY(1);opacity:1}}
@media(prefers-reduced-motion:no-preference){
  .workspace-boot[data-revealing]{animation:workspace-reveal 520ms ease-out}
  @keyframes workspace-reveal{
    from{opacity:1;visibility:visible;backdrop-filter:blur(7px)}
    to{opacity:0;visibility:hidden;backdrop-filter:blur(0)}
  }
}
@media(prefers-reduced-motion:reduce){.workspace-bars i{animation:none}}
.demo-frame{display:block;width:100%;height:100vh;height:100dvh;border:0}
noscript{position:fixed;inset:0;z-index:2;display:grid;place-items:center;background:#f0f2ee;color:#35575d}`;

const script = `(() => {
  "use strict";
  const frame = document.getElementById("workspace-frame");
  const loader = document.getElementById("workspace-boot");
  let settled = false;
  function requestLoadingStatus() {
    try {
      const target = frame.contentWindow.location;
      if (target.origin === location.origin && ["/login", "/onboarding"].includes(target.pathname)) {
        location.replace(target.href);
        return;
      }
    } catch { /* An inaccessible frame cannot provide a redirect. */ }
    frame.contentWindow?.postMessage({ type:"workspace:status" }, location.origin);
  }
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const type = event.data?.type;
    if (settled || (type !== "dashboard:ready" && type !== "dashboard:startup-error")) return;
    settled = true;
    loader.setAttribute("aria-busy", "false");
    loader.setAttribute("aria-hidden", "true");
    frame.inert = false;
    if (type === "dashboard:ready") {
      const timing = event.data.timing;
      const server = Object.fromEntries(Object.entries(timing?.server || {}).filter(([,value]) => Number.isFinite(value)));
      window.__workspaceStartupTiming = {
        readyMs:Math.round(performance.now()), requestMs:Number(timing?.requestMs) || 0, server
      };
      performance.mark("workspace:ready");
      loader.setAttribute("data-revealing", "");
    } else {
      loader.hidden = true;
    }
  });
  frame.addEventListener("load", requestLoadingStatus);
  requestLoadingStatus();
})();`;

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#087f8d">
<meta name="application-name" content="Tax Dashboard">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Tax Dashboard">
<title>Tax Dashboard</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180">
<style>${style}</style>
</head><body>
<div id="workspace-boot" class="workspace-boot" role="status" aria-live="polite" aria-busy="true">
  <span class="workspace-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
  <span>Loading workspace...</span>
</div>
<iframe id="workspace-frame" class="demo-frame" src="/demo.html?v=workspace-boot-v2" title="Tax Dashboard" inert></iframe>
<noscript>Enable JavaScript to use Tax Dashboard.</noscript>
<script>${script}</script>
</body></html>`;

const hash = source => `'sha256-${createHash("sha256").update(source.replace(/\r\n?/g, "\n")).digest("base64")}'`;
const policy = [
  "default-src 'none'", "frame-ancestors 'self'", "frame-src 'self'", "base-uri 'none'", "form-action 'none'",
  "object-src 'none'", "img-src 'self'", "manifest-src 'self'", `style-src ${hash(style)}`,
  `script-src ${hash(script)}`, "script-src-attr 'none'", "require-trusted-types-for 'script'", "trusted-types 'none'"
].join("; ");

function workspaceEntryPolicies() {
  return ["/", "/dashboard"].map(source => ({source, headers:[
    {key:"Content-Security-Policy", value:policy},
    {key:"Content-Security-Policy-Report-Only", value:policy}
  ]}));
}

function workspaceEntryResponse() {
  return new Response(html, { headers:{ "Content-Type":"text/html; charset=utf-8" } });
}

module.exports = { html, workspaceEntryPolicies, workspaceEntryResponse };
