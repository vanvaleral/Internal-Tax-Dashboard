import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
async function fixture(permission = "default", registered = false) {
  const warnings: string[] = [], events: string[] = [], requests: any[] = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", e => warnings.push(e.message));
  const dom = new JSDOM(read("public/demo.html"), { runScripts: "outside-only", url: "http://localhost/demo.html", virtualConsole: vc }), w = dom.window as any;
  let allowed = permission, linked = registered;
  const subscription = { endpoint: "https://push.invalid/current", unsubscribe: async () => { linked = false; return true; }, toJSON: () => ({ endpoint: "https://push.invalid/current", keys: { p256dh: "key", auth: "auth" } }) };
  const registration = { pushManager: { getSubscription: async () => subscription, subscribe: async () => { events.push("subscribe"); return subscription; } } };
  Object.defineProperty(w.navigator, "serviceWorker", { value: { register: async () => { events.push("register"); return registration; }, ready: Promise.resolve(registration) } });
  w.PushManager = function() {};
  w.Notification = { get permission() { return allowed; }, requestPermission: () => { events.push("permission"); allowed = "granted"; return Promise.resolve(allowed); } };
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestIdleCallback = () => 0; w.setInterval = () => 0; w.setTimeout = () => 0;
  w.Headers = Headers; w.Response = Response; w.structuredClone = structuredClone;
  w.fetch = async (url: string, init: any = {}) => {
    let body: any;
    if (url === "/api/push-subscriptions") {
      requests.push({ url, ...init });
      if (init.method === "POST") { const input = JSON.parse(init.body); if (input.action !== "test") linked = true; body = input.action === "test" ? { accepted: true } : { enabled: true }; }
      else body = { configured: true, enabled: true, deviceEnabled: linked, publicKey: "BAAA" };
    } else body = url === "/api/profile" ? { user: { id: "push-user" }, profile: { id: "supervisor", role: "supervisor", display_name: "Supervisor", directory_active: true } } : { data: [], tasks: [], staff: [], announcements: [] };
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  };
  for (const file of ["public/vendor/purify.min.js", "public/workspace-sync.js", "public/feature-access.js", "public/annual-sheet-dashboard.js"]) w.eval(read(file));
  await w.eval(read("public/demo.html").match(/<script>([\s\S]*?)<\/script>/)![1]); await tick();
  w.document.querySelector("[data-open-appearance-settings]").click(); await tick();
  return { dom, w, warnings, events, requests };
}

test("push settings use this browser's subscription, request permission only from its click and expose a test action", async () => {
  const d = await fixture();
  try {
    const doc = d.w.document;
    assert.equal(doc.querySelector("[data-toggle-push-notifications]").textContent, "Off");
    assert.equal(doc.querySelector("[data-test-push-notification]").disabled, true);
    assert.equal(d.events.includes("permission"), false, "opening settings must not prompt");
    assert.equal(new Headers(d.requests[0].headers).get("x-push-endpoint"), "https://push.invalid/current");
    d.events.length = 0;
    doc.querySelector("[data-toggle-push-notifications]").click();
    assert.equal(d.events[0], "permission", "permission occurs before asynchronous SW work");
    await tick();
    assert.equal(doc.querySelector("[data-toggle-push-notifications]").textContent, "On");
    assert.equal(doc.querySelector("[data-test-push-notification]").disabled, false);
    doc.querySelector("[data-test-push-notification]").click(); await tick();
    assert.equal(JSON.parse(d.requests.at(-1).body).action, "test");
    assert.match(doc.querySelector('[role="dialog"][aria-label="Appearance settings"]').textContent, /Test accepted by the push service/);
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});

test("denied browser permission cannot be shown as enabled even when server subscriptions exist", async () => {
  const d = await fixture("denied", true);
  try {
    const doc = d.w.document;
    assert.equal(doc.querySelector("[data-toggle-push-notifications]").textContent, "Off");
    assert.match(doc.querySelector('[role="dialog"][aria-label="Appearance settings"]').textContent, /blocked in browser settings/);
    assert.equal(d.events.includes("permission"), false);
    assert.deepEqual(d.warnings, []);
  } finally { d.dom.window.close(); }
});
