(function (root) {
  const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const equal = (a, b) => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => equal(item, b[index]));
    if (plain(a) && plain(b)) { const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => equal(a[key], b[key])); }
    return false;
  };
  const keyOf = row => row && typeof row === "object" ? String(row.databaseId || row.clientId || row.client_id || row.clientCode || row.clientName || row.id || "") : "";
  function reconcile(base, local, remote) {
    const conflicts = [];
    function visit(before, ours, theirs, path) {
      if (equal(ours, before)) return theirs;
      if (equal(theirs, before) || equal(ours, theirs)) return ours;
      if (Array.isArray(before) && Array.isArray(ours) && Array.isArray(theirs) && [...before, ...ours, ...theirs].every(keyOf)) {
        const maps = [before, ours, theirs].map(rows => new Map(rows.map(row => [keyOf(row), row])));
        const keys = new Set([...maps[2].keys(), ...maps[1].keys()]);
        return [...keys].map(key => visit(maps[0].get(key), maps[1].get(key), maps[2].get(key), `${path}/${key}`)).filter(value => value !== undefined);
      }
      if (plain(before) && plain(ours) && plain(theirs)) {
        const result = {};
        for (const key of new Set([...Object.keys(before), ...Object.keys(ours), ...Object.keys(theirs)])) {
          if (["__proto__", "constructor", "prototype"].includes(key)) continue;
          const value = visit(before[key], ours[key], theirs[key], `${path}/${key}`);
          if (value !== undefined) result[key] = value;
        }
        return result;
      }
      conflicts.push(path || "record");
      return ours;
    }
    return { value: visit(base, local, remote, ""), conflicts };
  }
  const api = { reconcile, equal };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WorkspaceSync = api;
})(typeof window === "undefined" ? globalThis : window);
