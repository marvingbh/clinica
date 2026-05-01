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

/**
 * B15: security headers. CSP is deliberately permissive on 'unsafe-inline'
 * for style/script because Sonner toasts inject inline styles and Stripe.js
 * bootstraps inline. Deploy as Content-Security-Policy-Report-Only first for
 * 48h to catch violations, then flip to enforcing. HSTS preload is a one-way
 * door — only set `preload` once you've submitted to hstspreload.org.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.stripe.com https://*.upstash.io https://api.resend.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()" },
  { key: "Content-Security-Policy", value: csp },
]

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
};

export default withPWA(nextConfig);
