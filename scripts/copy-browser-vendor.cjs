const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
fs.mkdirSync(path.join(root, "public/vendor"), { recursive: true });
fs.copyFileSync(path.join(root, "node_modules/dompurify/dist/purify.min.js"), path.join(root, "public/vendor/purify.min.js"));
fs.copyFileSync(path.join(root, "node_modules/xlsx/dist/xlsx.full.min.js"), path.join(root, "public/vendor/xlsx.full.min.js"));
fs.copyFileSync(path.join(root, "node_modules/jspdf/dist/jspdf.umd.min.js"), path.join(root, "public/vendor/jspdf.umd.min.js"));
fs.copyFileSync(path.join(root, "node_modules/jspdf/LICENSE"), path.join(root, "public/vendor/jspdf-LICENSE.txt"));
require("./build-workspace-shell.cjs").buildWorkspace();
