import type { ReactNode } from "react"
import { PortalSessionProvider } from "./components/PortalSessionProvider"

export const dynamic = "force-dynamic"

export default async function PortalLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <PortalSessionProvider slug={slug}>
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <link rel="manifest" href={`/api/public/portal/${slug}/manifest`} />
        <meta name="theme-color" content="#0f766e" />
      </head>
      <div className="min-h-screen bg-background">{children}</div>
    </PortalSessionProvider>
  )
}
