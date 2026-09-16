(function (root) {
  function parseAmount(value) {
    if (value === "" || value == null) return 0;
    let amount;
    if (typeof value === "number") amount = value;
    else {
      const text = String(value).trim().replace(/^(?:Rp\.?|IDR)\s*/i, "");
      if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text) || /^\d+(?:,\d{1,2})?$/.test(text)) amount = Number(text.replace(/\./g, "").replace(",", "."));
      else if (/^\d+\.\d{1,2}$/.test(text)) amount = Number(text);
      else throw new Error("Use a non-negative rupiah amount, for example 1.234,56.");
    }
    if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001) throw new Error("Amounts must be non-negative with at most two decimal places.");
    return Math.round(amount * 100) / 100;
  }
  const api = { parseAmount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ClaimValues = api;
})(typeof window === "undefined" ? globalThis : window);
