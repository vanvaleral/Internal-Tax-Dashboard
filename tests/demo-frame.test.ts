import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const framePath = new URL("../components/demo/demo-frame.tsx", import.meta.url);
const globalsPath = new URL("../app/globals.css", import.meta.url);

test("dashboard iframe uses the mobile dynamic viewport", async () => {
  const [frame, globals] = await Promise.all([
    readFile(framePath, "utf8"),
    readFile(globalsPath, "utf8")
  ]);

  assert.match(frame, /className="demo-frame w-full border-0"/);
  assert.match(frame, /src="\/demo\.html\?v=client-sorting-v4"/);
  assert.match(globals, /\.demo-frame \{[\s\S]*height: 100vh;[\s\S]*height: 100dvh;/);
});
