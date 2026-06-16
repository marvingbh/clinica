import "fumadocs-ui/style.css";
import "./theme.css";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { Inter } from "next/font/google";
import { provider } from "@/lib/layout.shared";

const inter = Inter({ subsets: ["latin"] });

export default async function RootLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          i18n={provider(lang)}
          theme={{ defaultTheme: "light", enableSystem: false }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
