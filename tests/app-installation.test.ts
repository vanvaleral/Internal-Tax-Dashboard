import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { JSDOM } from "jsdom";
import { isPublicUiAsset } from "../lib/public-ui-assets.ts";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const bytes = (file: string) => readFileSync(new URL(`../public${file}`, import.meta.url));
const manifest = JSON.parse(read("public/manifest.webmanifest"));

test("app manifest identifies one live protected dashboard without embedding account data or adding offline caching", () => {
  assert.equal(manifest.id, "/"); assert.equal(manifest.start_url, "/dashboard");
  assert.equal(manifest.scope, "/"); assert.equal(manifest.display, "standalone");
  assert.equal(manifest.short_name, "Tax Dashboard"); assert.match(manifest.name, /LMATS Consulting/);
  assert.equal(manifest.prefer_related_applications, false);
  assert.equal(isPublicUiAsset(manifest.start_url, "GET"), false, "start URL remains authenticated");
  assert.doesNotMatch(read("public/push-sw.js"), /caches\.|addEventListener\("fetch"/);
});

test("all install icons have declared PNG dimensions and anonymous read-only access", async () => {
  for (const icon of manifest.icons) {
    const [width, height] = icon.sizes.split("x").map(Number);
    const image = await sharp(bytes(icon.src)).metadata();
    assert.equal(image.format, "png"); assert.equal(image.width, width); assert.equal(image.height, height);
    assert.equal(icon.type, "image/png");
    assert.equal(isPublicUiAsset(icon.src, "GET"), true); assert.equal(isPublicUiAsset(icon.src, "HEAD"), true);
    assert.equal(isPublicUiAsset(icon.src, "POST"), false);
  }
  assert.ok(manifest.icons.some((icon: any) => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon: any) => icon.sizes === "512x512" && icon.purpose === "any"));
  const touch = await sharp(bytes("/icons/apple-touch-icon.png")).metadata();
  assert.equal(touch.width, 180); assert.equal(touch.height, 180);
});

test("the maskable icon is opaque and all artwork stays inside its central safe circle", async () => {
  const icon = manifest.icons.find((item: any) => item.purpose === "maskable");
  const { data, info } = await sharp(bytes(icon.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let artwork = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const offset = (y * info.width + x) * 4;
    assert.equal(data[offset + 3], 255, "maskable canvas must be opaque");
    if (Math.abs(data[offset] - 240) + Math.abs(data[offset + 1] - 242) + Math.abs(data[offset + 2] - 238) > 8) {
      artwork++;
      assert.ok(Math.hypot(x + 0.5 - info.width/2, y + 0.5 - info.height/2) <= info.width * 0.4, "artwork cannot be clipped by a platform mask");
    }
  }
  assert.ok(artwork > 10000);
});

test("desktop artwork fills the icon canvas without clipping or inheriting mobile padding", async () => {
  for (const icon of manifest.icons.filter((item: any) => item.purpose === "any")) {
    const { data, info } = await sharp(bytes(icon.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, right = -1, top = info.height, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    assert.ok((right - left + 1) / info.width >= 0.94);
    assert.ok((bottom - top + 1) / info.height >= 0.94);
    assert.ok(left > 0 && top > 0 && right < info.width - 1 && bottom < info.height - 1, "retain a small unclipped edge");
  }
});

test("Windows ICO contains complete 16/32/48 PNG frames and the PNG favicon is 32px", async () => {
  const icon = bytes("/favicon.ico");
  assert.equal(icon.readUInt16LE(0), 0); assert.equal(icon.readUInt16LE(2), 1); assert.equal(icon.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + 16 * index, length = icon.readUInt32LE(entry + 8), offset = icon.readUInt32LE(entry + 12);
    assert.equal(icon[entry], size); assert.equal(icon[entry+1], size);
    assert.ok(offset + length <= icon.length);
    const image = await sharp(icon.subarray(offset, offset + length)).metadata();
    assert.equal(image.width, size); assert.equal(image.height, size);
  }
  assert.equal((await sharp(bytes("/favicon-32.png")).metadata()).width, 32);
});

test("Next metadata and direct dashboard/annual documents reference the same app identity and branding", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /manifest: "\/manifest.webmanifest"/);
  assert.match(layout, /applicationName: "Tax Dashboard"/);
  assert.match(layout, /shortcut: "\/favicon.ico"/);
  assert.match(layout, /\/icons\/apple-touch-icon.png/);
  for (const path of ["public/demo.html", "public/annual-accounting-sheet-demo.html"]) {
    const dom = new JSDOM(read(path));
    try {
      assert.equal(dom.window.document.querySelector('link[rel="manifest"]')?.getAttribute("href"), "/manifest.webmanifest");
      assert.equal(dom.window.document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href"), "/icons/apple-touch-icon.png");
      assert.ok(dom.window.document.querySelector('link[rel="icon"][type="image/svg+xml"]'), "existing tab favicon retained");
    } finally { dom.window.close(); }
  }
});
