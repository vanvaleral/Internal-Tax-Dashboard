import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

export function loadRoute(file: string, bindings: Record<string, any>) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {} as Record<string, any>, require(name: string) {
    if (name === "next/server") return { NextResponse: { json: (body: any, options: any) => ({ body, status: options?.status || 200 }) }, after: () => {} };
    if (name in bindings) return bindings[name];
    throw new Error(`Unmocked route dependency ${name}`);
  }, URL, Date, Set, Map, structuredClone, console };
  vm.runInNewContext(compiled, context, { filename: file });
  return context.exports;
}

export const request = (body: any = {}, search = "") => ({ url: `http://test.local/api/operations${search}`, json: async () => body });

export function mockDatabase(tables: Record<string, any[]>) {
  const db = { tables, beforeWrite: null as (() => void) | null, from(table: string) {
    let filters: Array<(row: any) => boolean> = [], action = "read", input: any, single = false;
    const query: any = {
      select() { return query; }, order() { return query; }, limit() { return query; },
      eq(key: string, value: any) { filters.push(row => row[key] === value); return query; },
      is(key: string, value: any) { filters.push(row => (row[key] ?? null) === value); return query; },
      in(key: string, values: any[]) { filters.push(row => values.includes(row[key])); return query; },
      or(expression: string) { const parts = expression.split(",").map(item => item.split(".eq.")); filters.push(row => parts.some(([key, value]) => row[key] === value)); return query; },
      insert(value: any) { action = "insert"; input = value; return query; },
      update(value: any) { action = "update"; input = value; return query; },
      upsert(value: any) { action = "upsert"; input = value; return query; },
      maybeSingle() { single = true; return Promise.resolve(run()); }, single() { single = true; return Promise.resolve(run()); },
      then(resolve: any, reject: any) { return Promise.resolve(run()).then(resolve, reject); }
    };
    function run() {
      if (action !== "read" && db.beforeWrite) { const callback = db.beforeWrite; db.beforeWrite = null; callback(); }
      const rows = tables[table] ||= [];
      let result = rows.filter(row => filters.every(filter => filter(row)));
      if (action === "insert") {
        const added = (Array.isArray(input) ? input : [input]).map(item => ({ id: `test-${rows.length + 1}`, created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", ...structuredClone(item) }));
        if (added.some(item => rows.some(row => table === "operational_workspace_state" ? row.scope === item.scope : item.client_request_id && row.client_request_id === item.client_request_id && row.created_by_profile_id === item.created_by_profile_id))) return { data: null, error: { code: "23505", message: "duplicate" } };
        rows.push(...added); result = added;
      }
      if (action === "update") result.forEach(row => Object.assign(row, structuredClone(input), table === "my_work_tasks" ? { updated_at: `${row.updated_at}+1` } : {}));
      if (action === "upsert") { result = Array.isArray(input) ? input : [input]; rows.push(...structuredClone(result)); }
      return { data: structuredClone(single ? result[0] || null : result), error: null };
    }
    return query;
  } };
  return db;
}
