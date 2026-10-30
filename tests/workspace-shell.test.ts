import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("the public root shell contains no authenticated data or Supabase calls", () => {
  const source = read("app/page.tsx");
  assert.match(source, /<DemoFrame/);
  assert.doesNotMatch(source, /createClient|getUser|staff_profiles|cookies\(/);
});

test("the shell promotes login redirects and only accepts readiness from its own same-origin iframe", () => {
  const listeners = new Map<string, (event: any) => void>();
  const redirects: string[] = [], marks: string[] = [], states: boolean[] = [];
  const frameWindow = { location: { pathname: "/demo.html", href: "https://test.local/demo.html" }, postMessage() {} };
  const window: any = { location: { origin: "https://test.local", replace: (url: string) => redirects.push(url) }, addEventListener: (name: string, callback: any) => listeners.set(name, callback), removeEventListener() {} };
  const elements = (_type: any, props: any) => ({ type: _type, props });
  const context = { exports: {} as any, window, performance: { now: () => 1200, mark: (name: string) => marks.push(name) }, require(name: string) {
    if (name === "react") return { useRef: () => ({ current: { contentWindow: frameWindow } }), useState: () => [true, (value: boolean) => states.push(value)], useEffect: (callback: () => void) => callback() };
    if (name === "react/jsx-runtime") return { jsx: elements, jsxs: elements, Fragment: "fragment" };
    if (name === "./workspace-loader") return { WorkspaceLoader: "loader" };
    throw new Error(name);
  } };
  const compiled = ts.transpileModule(read("components/demo/demo-frame.tsx"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, context);
  const tree = context.exports.DemoFrame();
  const receive = listeners.get("message")!;
  receive({ origin: "https://evil.invalid", source: frameWindow, data: { type: "dashboard:mounted" } });
  receive({ origin: window.location.origin, source: {}, data: { type: "dashboard:mounted" } });
  assert.equal(states.length, 0);
  receive({ origin: window.location.origin, source: frameWindow, data: { type: "dashboard:mounted" } });
  assert.deepEqual(states, [false]);
  receive({ origin: window.location.origin, source: frameWindow, data: { type: "dashboard:ready", timing: { requestMs: 850, server: { auth: 100 } } } });
  assert.equal(window.__workspaceStartupTiming.readyMs, 1200);
  assert.equal(window.__workspaceStartupTiming.requestMs, 850);
  assert.deepEqual(marks, ["workspace:ready"]);
  frameWindow.location = { pathname: "/login", href: "https://test.local/login?error=staff-access-disabled" };
  tree.props.children[1].props.onLoad();
  assert.deepEqual(redirects, [frameWindow.location.href]);
});
