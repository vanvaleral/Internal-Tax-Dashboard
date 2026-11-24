import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import ts from "typescript";
import * as authLanguage from "../lib/auth-language.ts";

const require = createRequire(import.meta.url);

test("staff registration shows progress, recovers from errors, then returns to sign-in", async (t) => {
  const { window } = new JSDOM('<div id="root"></div>', { url: "https://dashboard.test/login" });
  const { document } = window;
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true });
  t.after(() => {
    window.close();
    for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) Reflect.deleteProperty(globalThis, key);
  });

  let requestCount = 0;
  let authCalls = 0;
  let resolveRegistration!: (response: Response) => void;
  const registrationPending = new Promise<Response>((resolve) => { resolveRegistration = resolve; });
  const authLanguageModule = { exports: {}, window, document, localStorage: window.localStorage, require(name: string) {
    return name === "@/lib/auth-language" ? authLanguage : require(name);
  }};
  const languageComponent = readFileSync(new URL("../components/auth/auth-language.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(languageComponent, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, authLanguageModule);
  const context = {
    exports: {} as { LoginForm: React.ComponentType },
    window,
    require(name: string) {
      if (name === "@/lib/supabase/client") return { createClient() { authCalls++; } };
      if (name === "@/components/auth/auth-language") return authLanguageModule.exports;
      return require(name);
    },
    async fetch(path: string, options: RequestInit) {
      assert.equal(path, "/api/auth/register");
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(String(options.body)).username, "new.staff");
      requestCount++;
      if (requestCount === 1) throw new TypeError("Network unavailable");
      if (requestCount === 2) return Response.json({ error: "This staff claim code is invalid." }, { status: 401 });
      return registrationPending;
    }
  };
  const loginForm = readFileSync(new URL("../components/auth/login-form.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(loginForm, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, context);

  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.querySelector("#root")!);
  try {
    await act(async () => root.render(createElement(context.exports.LoginForm)));
    await act(async () => document.querySelector<HTMLButtonElement>(".auth-mode-button")!.click());
    const setInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    for (const [placeholder, value] of [
      ["lowercase username", "new.staff"],
      ["name@company.com", "new.staff@example.com"],
      ["At least 8 characters", "password-for-test"],
      ["Repeat password", "password-for-test"],
      ["Provided privately by management", "TEST-CODE"]
    ]) {
      const input = document.querySelector(`input[placeholder="${placeholder}"]`)!;
      await act(async () => {
        setInput.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
    }
    const submit = () => act(async () => {
      document.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });
    await submit();
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /Check your connection/);
    assert.equal(document.querySelector<HTMLFieldSetElement>("fieldset")!.disabled, false);

    await submit();
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /claim code is invalid/);
    assert.equal(document.querySelector<HTMLFieldSetElement>("fieldset")!.disabled, false);

    await submit();
    assert.equal(document.querySelector<HTMLFieldSetElement>("fieldset")!.disabled, true);
    assert.ok(document.querySelector(".auth-submit-spinner"));
    assert.match(document.querySelector('[role="status"]')!.textContent!, /Creating account/);
    await submit();
    assert.equal(requestCount, 3, "a pending request blocks repeat submissions");

    await act(async () => resolveRegistration(Response.json({ email: "new.staff@example.com" }, { status: 201 })));
    assert.equal(window.location.pathname, "/login");
    assert.equal(document.querySelector("h1")!.textContent, "Sign in");
    assert.match(document.querySelector('[role="status"]')!.textContent!, /Account created successfully/);
    assert.equal(document.querySelector<HTMLInputElement>('input[autocomplete="username"]')!.value, "new.staff");
    const password = document.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')!;
    assert.equal(password.value, "");
    assert.equal(document.activeElement, password);
    assert.equal(authCalls, 0, "registration does not attempt automatic sign-in");
    await act(async () => document.querySelector<HTMLButtonElement>('.auth-language [lang="id"]')!.click());
    assert.equal(document.documentElement.lang, "id");
    assert.equal(document.querySelector("h1")!.textContent, "Masuk");
    assert.match(document.querySelector('[role="status"]')!.textContent!, /Akun berhasil dibuat/);
    assert.equal(document.querySelector<HTMLInputElement>('input[autocomplete="username"]')!.value, "new.staff");
    assert.equal(window.localStorage.getItem("tax-dashboard:language"), "id");
  } finally {
    await act(async () => root.unmount());
  }
});
