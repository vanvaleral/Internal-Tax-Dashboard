const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { minify_sync } = require("next/dist/compiled/terser/bundle.min.js");
const root = path.resolve(__dirname,"..");

function buildWorkspace({write=true}={}) {
  const source = fs.readFileSync(path.join(root,"public/demo.html"),"utf8");
  const end = source.indexOf("</head>");
  if (end<0) throw new Error("Dashboard head is missing.");
  const styles = [];
  let head = source.slice(0,end).replace(/<style>([\s\S]*?)<\/style>/g,(_,css)=>{styles.push(css);return "";});
  if (styles.length!==2) throw new Error("Review dashboard style extraction after changing the head.");
  styles.push(fs.readFileSync(path.join(root,"public/submenu-tabs.css"),"utf8"));
  const css = styles.join("\n");
  const hash = createHash("sha256").update(css).digest("hex").slice(0,12);
  const allocationRevision = createHash("sha256").update(fs.readFileSync(path.join(root,"public/allocation-sheet.js"))).digest("hex").slice(0,12);
  head = head.replace(/<link rel="stylesheet" href="submenu-tabs.css"\s*\/>/,"");
  head += `<meta name="workspace-allocation-revision" content="${allocationRevision}">\n`;
  const critical = `<style data-workspace-critical>html,body{margin:0;background:#f0f2ee}html:not(.workspace-style-ready) .shell{display:none}.app-loading-overlay.initial-load{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;background:#f0f2ee;color:#35575d;font:13px "Segoe UI",sans-serif}.app-loading-overlay:not(.visible){display:none}.app-loading-card{display:grid;justify-items:center;gap:14px}.workspace-bars{display:flex;align-items:flex-end;gap:5px;height:30px}.workspace-bars i{display:block;width:5px;height:12px;background:#0891a6;transform-origin:bottom;animation:workspace-pulse 1.1s ease-in-out infinite}.workspace-bars i:nth-child(2){height:18px}.workspace-bars i:nth-child(3){height:24px}.workspace-bars i:nth-child(4){height:30px}@keyframes workspace-pulse{0%,100%{transform:scaleY(.6);opacity:.45}50%{transform:scaleY(1);opacity:1}}@media(prefers-reduced-motion:reduce){.workspace-bars i{animation:none}}</style>
<link rel="preload" href="/workspace-shell.css?v=${hash}" as="style">
<link id="workspace-shell-style" rel="stylesheet" href="/workspace-shell.css?v=${hash}" media="print">
<script data-workspace-style-ready>
window.WorkspaceStyleReady=new Promise((resolve,reject)=>{const link=document.getElementById("workspace-shell-style");const ready=()=>{link.media="all";document.documentElement.classList.add("workspace-style-ready");resolve()};if(link.sheet)ready();else{link.addEventListener("load",ready,{once:true});link.addEventListener("error",()=>reject(new Error("Workspace styles could not be loaded. Reload to retry.")),{once:true})}});window.WorkspaceStyleReady.catch(()=>{});
</script>`;
  // Formatting only: preserve identifiers and avoid optimizer rewrites of business logic.
  let scripts = 0, scriptSourceBytes = 0, scriptBytes = 0;
  const body = source.slice(end).replace(/<script>([\s\S]*?)<\/script>/g,(_,code)=>{
    const compact = minify_sync(code,{compress:false,mangle:false,ecma:2022,format:{comments:false,inline_script:true}}).code;
    scripts++; scriptSourceBytes += Buffer.byteLength(code); scriptBytes += Buffer.byteLength(compact);
    return `<script>${compact}</script>`;
  });
  if (scripts !== 1) throw new Error("Review dashboard script compaction after changing the runtime.");
  const html = head+critical+body;
  if (write) {
    fs.writeFileSync(path.join(root,"public/workspace-built.html"),html);
    fs.writeFileSync(path.join(root,"public/workspace-shell.css"),css);
  }
  return {html,css,scriptSourceBytes,scriptBytes,sourceBytes:Buffer.byteLength(source),htmlBytes:Buffer.byteLength(html)};
}
module.exports = {buildWorkspace};
if (require.main===module) {
  const result=buildWorkspace();
  console.log(`Workspace HTML: ${result.sourceBytes} -> ${result.htmlBytes} bytes; reusable CSS: ${Buffer.byteLength(result.css)} bytes.`);
}
