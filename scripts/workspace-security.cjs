const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { buildWorkspace } = require("./build-workspace-shell.cjs");
const { resourcePolicyFor } = require("../lib/resource-policy.cjs");
const { workspaceEntryPolicies } = require("../lib/workspace-entry.cjs");
const root = path.resolve(__dirname,"..","public");

function scriptHashes(html) {
  const hashes = new Set();
  // Only hash trusted repository templates, never response/request/user HTML.
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
    const text = match[2].replace(/\r\n?/g,"\n");
    hashes.add(`'sha256-${createHash("sha256").update(text).digest("base64")}'`);
  }
  return [...hashes];
}

function documentPolicies(production) {
  const resourcePolicy = resourcePolicyFor(!production);
  const read = name => fs.readFileSync(path.join(root,name),"utf8");
  const dashboard = production ? buildWorkspace({write:false}).html : read("demo.html");
  const documents = new Map([
    ["/demo.html",dashboard],
    ["/workspace-built.html",production ? dashboard : buildWorkspace({write:false}).html],
    ["/annual-accounting-sheet-demo.html",read("annual-accounting-sheet-demo.html")],
    ["/annual-tax-sheet-demo.html",read("annual-tax-sheet-demo.html")]
  ]);
  return [...documents].map(([source,html]) => {
    const scripts = `script-src 'self' ${scriptHashes(html).join(" ")} 'report-sample'; script-src-attr 'none'`;
    return {source,headers:[
      {key:"Content-Security-Policy",value:`frame-ancestors 'self'; object-src 'none'; base-uri 'self'; ${scripts}; form-action 'self'; ${resourcePolicy}`},
      {key:"Content-Security-Policy-Report-Only",value:`default-src 'self'; ${scripts}; ${resourcePolicy}; object-src 'none'; base-uri 'self'; form-action 'self'`}
    ]};
  });
}

module.exports = {scriptHashes,documentPolicies,workspaceEntryPolicies};
