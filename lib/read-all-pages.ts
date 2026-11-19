type Page = { data: any[] | null; error: { message: string; code?: string } | null; count?: number | null };

// Respect the actual returned page length, including a project cap below our page size.
export async function readAllPages(build: (from: number, to: number) => PromiseLike<Page>, pageSize = 500) {
  const rows: any[] = [], ids = new Set<string>();
  let expected: number | undefined;
  for (;;) {
    const page = await build(rows.length, rows.length + pageSize - 1);
    if (page.error) throw Object.assign(new Error(page.error.message), { code: page.error.code });
    if (!Array.isArray(page.data)) throw new Error("List response was incomplete. Please retry.");
    if (typeof page.count === "number") {
      if (expected !== undefined && expected !== page.count) throw new Error("List changed while loading. Please retry.");
      expected = page.count;
    }
    for (const row of page.data) {
      if (row.id !== undefined) {
        const id = String(row.id);
        if (ids.has(id)) throw new Error("List changed while loading. Please retry.");
        ids.add(id);
      }
      rows.push(row);
    }
    if (expected !== undefined) {
      if (rows.length === expected) return rows;
      if (rows.length > expected || !page.data.length) throw new Error("List response was incomplete. Please retry.");
    } else if (page.data.length < pageSize) return rows;
  }
}
