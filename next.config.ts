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
  outputFileTracingIncludes: {
    "/api/**/*": ["./src/generated/prisma/**/*"],
    "/agenda/**/*": ["./src/generated/prisma/**/*"],
    "/login": ["./src/generated/prisma/**/*"],
    "/patients": ["./src/generated/prisma/**/*"],
    "/professionals": ["./src/generated/prisma/**/*"],
    "/groups": ["./src/generated/prisma/**/*"],
    "/settings/**/*": ["./src/generated/prisma/**/*"],
    "/admin/**/*": ["./src/generated/prisma/**/*"],
    "/profile": ["./src/generated/prisma/**/*"],
  },
};

export default withPWA(nextConfig);
