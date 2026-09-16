const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
fs.mkdirSync(path.join(root, "public/vendor"), { recursive: true });
fs.copyFileSync(path.join(root, "node_modules/dompurify/dist/purify.min.js"), path.join(root, "public/vendor/purify.min.js"));
