"use client"

import type { ReactNode } from "react"
import { usePortal } from "./PortalSessionProvider"
import { PortalLogin } from "./PortalLogin"
import { PortalNav } from "./PortalNav"
import { ReadOnlyBanner } from "./ReadOnlyBanner"

/**
 * Gates a logged-in portal page: shows a loading state, the login flow when
 * logged out, or the nav + read-only banner + page content when logged in.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { status, me } = usePortal()

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground text-sm">Carregando...</div>
      </main>
    )
  }

  if (status === "logged_out" || !me) {
    return <PortalLogin clinicName={me?.clinic.name ?? null} hasLogo={me?.clinic.hasLogo ?? false} />
  }

  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <PortalNav />
      <ReadOnlyBanner />
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
