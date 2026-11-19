import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const framePath = new URL("../lib/workspace-entry.cjs", import.meta.url);

test("dashboard iframe uses the mobile dynamic viewport", async () => {
  const frame = await readFile(framePath, "utf8");

  assert.match(frame, /class="demo-frame"/);
  assert.match(frame, /src="\/demo\.html\?v=client-sorting-v4"/);
  assert.match(frame, /\.demo-frame\{[^}]*height:100vh;height:100dvh;/);
});
