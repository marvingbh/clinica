"use client"

import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useSidebar } from "./sidebar-context"

// Paths that render without the sidebar — must match sidebar-nav.tsx.
const PUBLIC_PATHS = ["/login", "/signup", "/confirm", "/cancel", "/intake"]

/** Wraps app content with left padding to clear the sidebar.
 *  Returns bare children on public paths or when unauthenticated, so the
 *  landing page and auth screens can use the full viewport width. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { status } = useSession()
  const { collapsed } = useSidebar()

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const isLandingAnon = pathname === "/" && status === "unauthenticated"
  const showPadding = !isPublic && !isLandingAnon && status === "authenticated"

  const paddingClass = !showPadding
    ? ""
    : collapsed
      ? "md:pl-[64px]"
      : "md:pl-[220px]"

  return <div className={`${paddingClass} transition-[padding] duration-200`}>{children}</div>
}
