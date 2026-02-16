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

const nextConfig: NextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
