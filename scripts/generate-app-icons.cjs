const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");

async function png(source, size, ratio = 1, opaque = false) {
  const artwork = await sharp(source).resize(Math.round(size * ratio)).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: opaque ? "#f0f2ee" : "#00000000" } })
    .composite([{ input: artwork, gravity: "centre" }]).png().toBuffer();
}

function ico(frames) {
  const directory = Buffer.alloc(6 + 16 * frames.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  let offset = directory.length;
  frames.forEach(({ size, bytes }, index) => {
    const entry = 6 + 16 * index;
    directory[entry] = size;
    directory[entry + 1] = size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(bytes.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  });
  return Buffer.concat([directory, ...frames.map(frame => frame.bytes)]);
}

async function main() {
  const source = await fs.readFile(path.join(publicDir, "favicon.svg"));
  await fs.mkdir(path.join(publicDir, "icons"), { recursive: true });
  for (const size of [192, 512]) {
    await fs.writeFile(path.join(publicDir, "icons", `app-${size}.png`), await png(source, size, 0.88));
  }
  // Keep all meaningful artwork inside the maskable icon's central safe circle.
  await fs.writeFile(path.join(publicDir, "icons", "app-maskable-512.png"), await png(source, 512, 0.68, true));
  await fs.writeFile(path.join(publicDir, "icons", "apple-touch-icon.png"), await png(source, 180, 0.74, true));
  await fs.writeFile(path.join(publicDir, "favicon-32.png"), await png(source, 32));
  const frames = [];
  for (const size of [16, 32, 48]) frames.push({ size, bytes: await png(source, size) });
  await fs.writeFile(path.join(publicDir, "favicon.ico"), ico(frames));
  console.log("Generated app icons and favicon fallbacks from public/favicon.svg.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
