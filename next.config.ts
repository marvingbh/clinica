// Force Brazil timezone for consistent date parsing — ensures new Date("...T09:15:00")
// is always interpreted as 09:15 BRT, regardless of server timezone (e.g., UTC on Vercel)
process.env.TZ = "America/Sao_Paulo";

import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    disableDevLogs: true,
  },
});

// Content-Security-Policy.
// - Fonts are self-hosted by next/font/google at build time, so no external font hosts.
// - The only client-side cross-origin call is viacep.com.br (CEP/address autofill).
// - script/style allow 'unsafe-inline' because Next injects inline bootstrap without a
//   nonce; tightening to a nonce-based policy is a worthwhile follow-up.
const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required for Next's inline bootstrap (no nonce wired yet);
  // 'unsafe-eval' is intentionally omitted — Next 16 production does not need it.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://viacep.com.br https://api.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
]

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
};

export default withPWA(nextConfig);
