// Shared by static HTML headers, Next pages and nonce-protected auth pages.
const resourcePolicy = "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'self' blob:; worker-src 'self' blob:; media-src 'self' blob:; manifest-src 'self'";

function resourcePolicyFor(development = false) {
  // Explicit loopback WebSockets preserve Next's development hot reload only.
  return development ? resourcePolicy.replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*") : resourcePolicy;
}

module.exports = { resourcePolicy, resourcePolicyFor };
