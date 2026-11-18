import type { NextConfig } from "next";
const { documentPolicies } = require("./scripts/workspace-security.cjs");
const { resourcePolicyFor } = require("./lib/resource-policy.cjs");
const resourcePolicy = resourcePolicyFor(process.env.NODE_ENV === "development");

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    return {
      beforeFiles: process.env.NODE_ENV === "production"
        ? [{ source: "/demo.html", destination: "/workspace-built.html" }]
        : [],
      afterFiles: [],
      fallback: []
    };
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: `frame-ancestors 'self'; object-src 'none'; base-uri 'self'; script-src-attr 'none'; form-action 'self'; ${resourcePolicy}` },
      { key: "Content-Security-Policy-Report-Only", value: "default-src 'self'; script-src 'self' 'report-sample'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" }
    ] }, ...documentPolicies(process.env.NODE_ENV === "production")];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb"
    }
  }
};

export default nextConfig;
