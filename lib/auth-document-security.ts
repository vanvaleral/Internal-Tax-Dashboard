import { resourcePolicyFor } from "./resource-policy.cjs";

export function authDocumentPolicy(nonce: string, development = false) {
  if (!/^[A-Za-z0-9+/]{24}$/.test(nonce)) throw new TypeError("Invalid CSP nonce.");
  return `frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'report-sample'${development ? " 'unsafe-eval'" : ""}; script-src-attr 'none'; ${resourcePolicyFor(development)}`;
}

export function authDocumentSecurity(pathname: string, headers: Headers, development = false) {
  if (!["/login", "/onboarding"].includes(pathname)) return null;
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));
  const policy = authDocumentPolicy(nonce, development);
  const requestHeaders = new Headers(headers);
  // Overwrite incoming values: a caller must never choose the framework nonce.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  return { requestHeaders, policy };
}
