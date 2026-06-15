"use client"

import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useSidebar } from "./sidebar-context"
import { isPublicPagePath } from "@/lib/routes/public-paths"

/** Wraps app content with left padding to clear the sidebar.
 *  Returns bare children on public paths or when unauthenticated, so the
 *  landing page and auth screens can use the full viewport width. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { status } = useSession()
  const { collapsed } = useSidebar()

  const isPublic = isPublicPagePath(pathname)
  const isLandingAnon = pathname === "/" && status === "unauthenticated"
  const showPadding = !isPublic && !isLandingAnon && status === "authenticated"

  const paddingClass = !showPadding
    ? ""
    : collapsed
      ? "md:pl-[64px]"
      : "md:pl-[220px]"

  return <div className={`${paddingClass} transition-[padding] duration-200`}>{children}</div>
}
