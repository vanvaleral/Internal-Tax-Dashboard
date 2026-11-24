// Inventory literal UI copy that still needs a translation or an explicit
// decision to keep it unchanged. Runtime messages need a separate screen audit.
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const read = path => readFileSync(resolve(__dirname, "..", path), "utf8");
const sources = [
  "public/demo.html", "public/annual-accounting-sheet-demo.html", "public/annual-accounting-sheet-demo.js",
  "public/annual-tax-sheet-config.js", "public/annual-sheet-dashboard.js",
  "public/case-workflow-dashboard.js", "public/case-assessment-dashboard.js", "public/cases-assessment-panels.js",
  "public/allocation-sheet.js", "public/management-structure.js",
  "public/case-report.js", "public/allocation-report.js", "public/monthly-partner-report.html",
  "public/tax-claim-template.html", "lib/workspace-entry.cjs",
  "components/auth/login-form.tsx", "components/auth/onboarding-form.tsx"
];
const catalog = new Set(Array.from(read("public/workspace-language.js").matchAll(/"((?:[^"\\]|\\.)+)"\s*:\s*"/g), match => match[1]));
const markup = /<(?:title|h[1-6]|p|label|button|summary|option|th)\b[^<>]*>\s*([^<>{}`$]{2,350})\s*</gi;
const attributes = /\b(?:aria-label|placeholder|title)=(["'])([^<>{}`$`\r\n]+?)\1/g;
const normalize = value => value.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&apos;/g, "'").replace(/\s+/g," ").trim();
let total = 0;
for (const source of sources) {
  const text = read(source);
  const candidates = new Set([
    ...Array.from(text.matchAll(markup), match => normalize(match[1])),
    ...Array.from(text.matchAll(attributes), match => normalize(match[2]))
  ].filter(value => /[a-z]{3}/i.test(value) && /\s/.test(value)));
  const missing = [...candidates].filter(value => !catalog.has(value));
  total += missing.length;
  console.log(`${source}: ${missing.length} uncatalogued candidates`);
  if (process.argv.includes("--verbose")) for (const value of missing) console.log(`  ${value}`);
}
console.log(`${total} file-level candidates to translate or review. Catalog matches are not proof of screen coverage.`);
if (process.argv.includes("--check") && total) process.exitCode = 1;
