import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { isPublicUiAsset } from "../lib/public-ui-assets.ts";

test("only reviewed public UI assets bypass auth; data, HTML and extension-lookalike APIs never do", () => {
  for (const path of ["/favicon.svg", "/annual-sheet-live.js", "/annual-accounting-sheet-demo.css", "/vendor/purify.min.js", "/workspace-sync.js", "/images/lmats-logo-official.png"]) {
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)));
    assert.equal(isPublicUiAsset(path, "GET"), true);
    assert.equal(isPublicUiAsset(path, "HEAD"), true);
    assert.equal(isPublicUiAsset(path, "POST"), false);
  }
  for (const path of ["/", "/dashboard", "/demo.html", "/annual-accounting-sheet-demo.html", "/annual-accounting-sheet-demo.js", "/annual-tax-sheet-config.js", "/annual-accounting-dashboard-preview.js", "/api/annual-sheet", "/api/clients/export", "/api/profile.css", "/api/data.js", "/client-import-template.csv", "/private/data.svg", "/annual-sheet-live.js/extra"]) {
    assert.equal(isPublicUiAsset(path, "GET"), false, path);
  }
});

test("middleware delegates only the self-authenticating annual API and retains checks on other pages and APIs", async () => {
  let clients = 0, authReads = 0, profileReads = 0, user: any = null, active = true;
  const source = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { exports: {} as Record<string, any>, URL, console, process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://test.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test" } }, require(name: string) {
    if (name === "./lib/public-ui-assets") return { isPublicUiAsset };
    if (name === "next/server") return { NextResponse: {
      next: () => ({ status: 200, cookies: { set() {} } }),
      redirect: (url: URL) => ({ status: 307, location: url.pathname }),
      json: (body: any, options: any) => ({ body, status: options.status })
    } };
    if (name === "@supabase/ssr") return { createServerClient() {
      clients++;
      return { auth: { async getUser() { authReads++; return { data: { user } }; } }, from() { profileReads++; return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { directory_active: active } }; } }; } };
    } };
    throw new Error(`Unexpected dependency ${name}`);
  } };
  vm.runInNewContext(compiled, context);
  const run = (path: string, workspaceUser = "") => context.exports.middleware({ method: "GET", nextUrl: new URL(`https://test.local${path}`), url: `https://test.local${path}`, headers: { get: () => workspaceUser }, cookies: { getAll: () => [] } });
  assert.equal((await run("/annual-sheet-live.js")).status, 200);
  assert.equal((await run("/favicon.svg")).status, 200);
  assert.equal((await run("/api/annual-sheet")).status, 200, "annual handler performs fresh user, staff and account checks itself");
  assert.equal(clients, 0); assert.equal(authReads, 0); assert.equal(profileReads, 0);
  assert.equal((await run("/demo.html")).status, 307);
  assert.equal((await run("/api/clients")).status, 401);
  assert.equal((await run("/api/annual-sheet/extra")).status, 401);
  assert.equal((await run("/api/profile.css")).status, 401);
  user = { id: "current-account" }; active = false;
  assert.equal((await run("/api/clients")).status, 403);
  assert.equal((await run("/annual-accounting-sheet-demo.html")).status, 307);
  active = true;
  assert.equal((await run("/api/clients", "different-account")).status, 409);
  assert.equal((await run("/api/clients", "current-account")).status, 200);
  assert.ok(authReads > 0); assert.ok(profileReads > 0);
});
