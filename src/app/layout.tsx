import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { SessionProvider } from "@/shared/components/session-provider";
import { SidebarNav } from "@/shared/components/ui/sidebar-nav";
import { BottomNavigation } from "@/shared/components/ui/bottom-navigation";
import { PageTransition } from "@/shared/components/ui/page-transition";
import { AppShell } from "@/shared/components/ui/app-shell";
import { SubscriptionBanner } from "@/shared/components/SubscriptionBanner";
import CookieConsentBanner from "@/shared/components/CookieConsentBanner";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clinica",
  description: "Sistema de gestão para clínicas",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Clinica",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#F7F9FC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${plexSans.variable} ${plexMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <SessionProvider>
          <SidebarNav />
          <AppShell>
            <SubscriptionBanner />
            <PageTransition>
              {children}
            </PageTransition>
          </AppShell>
          <BottomNavigation />
          <Toaster richColors position="top-right" />
          <CookieConsentBanner />
        </SessionProvider>
      </body>
    </html>
  );
}
